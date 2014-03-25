/** @fileoverview
 * Provide Repository
 */
var Class    = require('js-class'),
    elements = require('evo-elements'),
    Logger   = elements.Logger,

    TrackedStates = require('./TrackedStates'),
    StagingStates = require('./StagingStates'),
    LocalQuery  = require('./LocalQuery'),
    RemoteQuery = require('./RemoteQuery'),
    Centralizer = require('./Centralizer'),
    LocalSyncer = require('./LocalSyncer'),
    StateSyncer = require('./StateSyncer');

/** @class Repository
 * @description A repository is an isolated container of states
 */
var Repository = Class({
    constructor: function (name, host) {
        this._name = name;
        this._host = host;
        this._logger = Logger.clone(host.logger, { prefix: '<' + name + '> ' });
        this._connector = host._connector;

        this._local = new TrackedStates();
        this._states = new StagingStates();

        this._mode = 'master';

        this._query = {
            local:  new LocalQuery(this),
            remote: new RemoteQuery(this)
        };
        this._query.current = this._query.local;

        this._centralizer = new Centralizer(this, this._logger, host.options);
        this._localSyncer = new LocalSyncer(this, this._logger, host.options);
        this._stateSyncer = new StateSyncer(this, this._logger, host.options);
    },

    destroy: function () {
        this._centralizer.stop();
        this._localSyncer.stop();
        this._stateSyncer.stop();
    },

    // Public APIs

    /** @function
     * @description Query consistent states
     * @param {Object} options   The query conditions
     *                      - nodes: Array of node ids to query, default query all
     *                      - global: false to skip global, default true
     *                      - keys: Array of keys to query, default all
     */
    query: function (options, callback) {
        if (typeof(options) == 'function') {
            callback = options;
            options = {};
        }
        typeof(options) == 'object' || (options = {});
        this._query.current.query(options, callback);
    },

    /** @function
     * @description Update local state
     */
    updateLocal: function (data, callback) {
        this._local.update(data);
        this[this._mode + ':localUpdated']();
        callback && callback();
    },

    /** @function
     * @description Update global state
     */
    updateGlobal: function (data, callback) {
        this[this._mode + ':updateGlobal'](data, callback || function () { });
    },

    /** @property {Boolean} centralized   Indicate current centralization state */
    get centralized () {
        return this._centralized;
    },

    // implement IStatesHost

    /** @property {String} name   The name of the repository */
    get name () {
        return this._name;
    },

    /** @property {String} localId   Id of this node */
    get localId () {
        var clusterInfo = this._connector.clusterInfo;
        return clusterInfo && clusterInfo.localId;
    },

    /** @property {Array} nodeIds   Array of node Ids in current cluster */
    get nodeIds () {
        var nodes = this._connector.clusterInfo && this._connector.clusterInfo.nodes;
        return Array.isArray(nodes) ? nodes.map(function (node) { return node.id; }) : [];
    },

    /** @property revision   Current stable revision */
    get revision () {
        return this._states.current.revision;
    },

    /** @function
     * @description Current states
     */
    states: function () {
        return {
            nodes: this._states.current.nodes.states(),
            global: this._states.current.global.state(),
            r: this.revision
        };
    },

    /** @function
     * @description Send centralize request
     */
    centralize: function () {
        this._connector.send({
            event: 'states.centralize',
            data: {
                repo: this.name,
                r: this.revision
            }
        });
    },

    /** @function
     * @description Announce latest updates
     */
    announce: function () {
        this._connector.send({
            event: 'states.announce',
            data: {
                repo: this.name,
                r: this.revision
            }
        });
    },

    /** @function
     * @description Request changes
     */
    requestChanges: function (callback) {
        this._connector.remoteRequest({
            event: 'states.sync',
            data: {
                repo: this.name,
                r: this.revision
            }
        }, 'master', callback);
    },

    /** @function
     * @description Apply changes
     */
    applyChanges: function (changes) {
        var applied = this._states.current.applyChanges(changes);
        this._switchQuery('local');
        applied && this._host._repoSynced(this);
    },

    publishLocalStates: function (callback) {
        this._connector.remoteRequest({
            event: 'states.update.local',
            data: {
                repo: this.name,
                state: this._local.state()
            }
        }, 'master', callback);
    },

    /** @function
     * @description Query states remotely
     */
    queryStates: function (options, callback) {
        this._connector.remoteRequest({
            event: 'states.query',
            data: {
                repo: this.name,
                options: options
            }
        }, 'master', callback);
    },

    // implement IMasterEventSink

    /** @function
     * @description Switch master mode
     */
    masterMode: function (master) {
        this._mode = master ? 'master' : 'slave';
    },

    /** @function
     * @description Update node local state
     */
    updateNode: function (nodeId, state, callback) {
        this._states.staging.synNode(nodeId, state);
        this._centralizer.start();
    },

    /** @function
     * @description Fetch changes since base revision
     */
    changes: function (base) {
        return this._states.current.changes(base);
    },

    /** @function
     * @description Update when cluster changes
     */
    clusterUpdated: function (nodeIds) {
        if (this._states.current.nodes.diffNodes(nodeIds)) {
            this._states.staging;   // create staging
            this._centralizer.start();
        }
    },

    /** @function
     * @description A node acknowledge centralization
     */
    centralizeAck: function (nodeId, data) {
        if (this._centralizer.acknowlege(nodeId, data)) {
            this._states.merge(this.nodeIds);
            this.announce();
        }
    },

    /** @function
     * @description Query states directly
     */
    masterQuery: function (options) {
        return this._query.local.queryAll(options);
    },

    // Internals
    'master:localUpdated': function () {
        this._states.staging.syncNode(this.localId, this._local.state());
        this._centralizer.start();
    },

    'slave:localUpdated': function () {
        this._localSyncer.start();
    },

    'master:updateGlobal': function (data, callback) {
        this._states.staging.updateGlobal(data);
        this._centralizer.start();
        callback();
    },

    'slave:updateGlobal': function (data, callback) {
        this._connector.remoteRequest({
            event: 'states.update.global',
            data: {
                repo: this.name,
                data: data
            }
        }, 'master', callback);
    },

    // implement IStatesSlaveEventSink

    /** @function
     * @description Start centralization
     */
    slaveCentralize: function (revision) {
        this._switchQuery('remote');
        this._connector.send({
            event: 'states.centralize.ack',
            data: {
                repo: this.name,
                r: revision
            }
        });
        this._host._repoCentralize(this.centralized, this);
    },

    slaveSync: function (revision) {
        if (this.revision != revision) {
            this._stateSyncer.start();
        }
    },

    _switchQuery: function (name) {
        this._query.current = this._query[name];
        this._centralized = name == 'remote';
    }
});

module.exports = Repository;
