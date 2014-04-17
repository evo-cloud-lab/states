/** @fileoverview
 * Provides States
 */
var Class  = require('js-class'),
    Logger = require('evo-elements').Logger,

    RevValue = require('./RevValue'),
    ClusterValues = require('./ClusterValues');

/** @class States
 * Facade class for states manipulations.
 *
 * The state managed is based on node and catalog. For each catalog,
 * each node has its own local state which must be a hash, then a subset
 * of properties can be get/set individually.
 *
 * The states are synchronized to all node and ensure all the nodes have
 * the same and consistent copy.
 */
var States = Class(process.EventEmitter, {
    constructor: function (clusterConnector, logger, options) {
        this._connector = clusterConnector;
        this._logger = Logger.wrap(logger);

        this._centralizeInterval = options['centralize-interval'] || 3000;
        this._retryInterval = options['retry-interval'] || 3000;

        this._localVals = new RevValue({});
        this._roVals = new ClusterValues();

        this._mode = States.MASTER;
    },

    get mode () {
        return this._mode;
    },

    set mode (m) {
        if (this._mode != m) {
            this._mode = m;
            this._invoke('enter');
            this.emit('mode', this._mode);
        }
    },

    get centralized () {
        return this.mode == States.SLAVE ? this._centralizing : null;
    },

    get revision () {
        var rev = this.centralized;
        rev == null && (rev = this._roVals.rev);
        return rev;
    },

    /** @function
     * @description query current value
     * @param {String} key unique key
     * @param {String} node node id
     */
    query: function (key, node, callback) {
        this._invoke('query', key, node, callback || function () {});
        return this;
    },

    /** @function
     * @description update local values
     */
    localCommit: function (object, callback) {
        this._localVals.merge(object);
        this._invoke('localCommitted', callback || function () {});
        return this;
    },

    /** @function
     * @description update global values
     */
    globalCommit: function (object, callback) {
        this._invoke('globalCommit', object, callback || function () {});
        return this;
    },

    /** @function
     * @description update when nodes changed
     */
    nodesUpdate: function (nodeIds) {
        this._invoke('nodesUpdate', nodeIds);
    },

    /** @function
     * @description dispatching messages
     */
    clusterMessage: function (event, data, src) {
        this._invoke('msg:' + event, data, src);
    },

    /** @function
     * @description dispatching requests
     */
    clusterRequest: function (event, data, src, callback) {
        this._invoke('req:' + event, data, src, callback || function () {});
    },

    _localQuery: function (key, node) {
        return this._roVals.query(key, node);
    },

    _invoke: function (method) {
        var fn = this[this.mode + ':' + method];
        fn && fn.apply(this, [].slice.call(arguments, 1));
    },

    _centralize: function () {
        if (!this._rwVals) {
            this._rwVals = new ClusterValues(true);
            this._centralizingNodes = {};
            this._roVals.nodes.forEach(function (id) {
                id != this._connector.localId && (this._centralizingNodes[id] = true);
            }, this);
            this._centralizingTimer = setInterval(this._sendCentralize.bind(this),
                                                  this._centralizeInterval);
            this._sendCentralize();
        }
        return this._rwVals;
    },

    _sendCentralize: function () {
        this._connector.message('states.centralize', { r: this._roVals.rev });
    },

    _isCentralizingCompleted: function () {
        if (this._centralizingNodes) {
            if (Object.keys(this._centralizingNodes).length == 0) {
                this._stopCentralizing();
                if (this._rwVals) {
                    var changes = this._roVals.merge(this._rwVals);
                    delete this._rwVals;
                    this._connector.message('states.sync', { r: this._roVals.rev });
                    this.emit('updated', this._roVals.rev, changes);
                }
            }
        }
    },

    _stopCentralizing: function () {
        this._centralizingTimer && clearInterval(this._centralizingTimer);
        delete this._centralizingTimer;
        delete this._centralizingNodes;
    },

    'master:enter': function () {
        this._stopSync();
        delete this._centralizing;
        delete this._synchronizing;
        this._stopCentralizing();
        this._centralize();
    },

    'master:query': function (key, node, callback) {
        callback(null, this._localQuery(key, node));
    },

    'master:localCommitted': function (callback) {
        this._centralize().sync(this._connector.localId, this._localVals);
        callback();
    },

    'master:globalCommit': function (object, callback) {
        this._centralize().sync(States.GLOBAL, object);
        callback();
    },

    'master:nodesUpdate': function (nodeIds) {
        this._centralize().clusterUpdate(nodeIds);
        var diff = Utils.diff(Object.keys(this._centralizingNodes), nodeIds);
        diff[0].forEach(function (id) {
            delete this._centralizingNodes[id];
        }, this);
        diff[1].forEach(function (id) {
            id != this._connector.localId && (this._centralizingNodes[id] = true);
        }, this);
        this._isCentralizingCompleted();
    },

    'master:msg:states.centralize.ack': function (data, src) {
        if (this._centralizingNodes) {
            delete this._centralizingNodes[src];
            this._isCentralizingCompleted();
        }
    },

    'master:req:states.query': function (data, src, callback) {
        callback(null, this._localQuery(data.key, data.node));
    },

    'master:req:states.nodeCommit': function (object, src, callback) {
        this._centralize().sync(src, object.d, object.r);
        callback();
    },

    'master:req:states.globalCommit': function (object, src, callback) {
        this['master:globalCommit'](object, callback);
    },

    _sync: function () {
        this._stopSync();
        if (this._mode != States.SLAVE || !this._synchronizing || this._syncReq) {
            return;
        }
        this._syncReq = true;
        this._connector.request('states.query', {}, function (err, results) {
            delete this._syncReq;
            if (!err && results) {
                if (this._centralizing == null || results.r == this._centralizing) {
                    var changes = this._roVals.reload(results);
                    this._syncComplete(changes);
                }
            } else if (this._synchronizing) {
                this._syncTimer = setTimeout(this._sync.bind(this), this._retryInterval);
            }
        }.bind(this));
    },

    _stopSync: function () {
        this._syncTimer && clearTimeout(this._syncTimer);
        delete this._syncTimer;
    },

    _syncStart: function () {
        if (!this._synchronizing) {
            this._synchronizing = true;
            delete this._syncReq;
            this._sync();
        }
    },

    _syncComplete: function (changes) {
        delete this._centralizing;
        this.emit('updated', this._roVals.rev, changes);
    },

    _centralized: function (rev) {
        if (this._centralizing != rev) {
            this._centralizing = rev;
            this.emit('centralized', rev);
        }
    },

    'slave:enter': function () {
        delete this._centralizing;
        delete this._synchronizing;
        this._syncStart();
    },

    'slave:query': function (key, node, callback) {
        if (this._centralizing != null) {
            this._connector.request('states.query', { key: key, node: node }, callback);
        } else {
            callback(null, this._localQuery(key, node));
        }
    },

    'slave:localCommitted': function (callback) {
        this._connector.request('states.nodeCommit', this._localVals.toObject(), callback);
    },

    'slave:globalCommit': function (object, callback) {
        this._connector.request('states.globalCommit', object, callback);
    },

    'slave:msg:states.centralize': function (data, src) {
        this._centralized(data.r);
        this._connector.message('states.centralize.ack', data, 'master');
    },

    'slave:msg:states.sync': function (data, src) {
        if (this._masterId != src || this._roVals.rev != data.r) {
            this._masterId = src;
            this._centralized(data.r);
            this._syncStart();
        }
    }
}, {
    statics: {
        GLOBAL: '',
        MASTER: 'master',
        SLAVE:  'slave'
    }
});

module.exports = States;
