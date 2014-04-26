/*var Class    = require('js-class'),
    flow     = require('js-flow'),
    elements = require('evo-elements'),
    BiMap    = elements.BiMap,
    Errors   = elements.Errors,
    Schema   = elements.Schema,
    neuron   = require('evo-neuron'),
    idioms   = require('evo-idioms'),

    RepoManager = require('./RepoManager');

var Program = Class(neuron.Program, {
    constructor: function () {
        neuron.Program.prototype.constructor.call(this, 'states', { neuron: { connects: ['connector'] } });
        this.connector = new idioms.ConnectorClient(this.neuron);
        (this.repos = new RepoManager(this.connector, this.logger, this.options))
            .on('centralized', this.onCentralized.bind(this))
            .on('synchronized', this.onSynchronized.bind(this));

        this._registry = new BiMap('id', 'repo');

        this
            .dispatch('register',   { schema: { name: 'string' } })
            .dispatch('unregister', { schema: { name: 'string' } })
            .dispatch('local.set',  { schema: {
                repo: 'string',
                data: 'object'
            } })
            .dispatch('global.set', { schema: {
                repo: 'string',
                data: 'object'
            } })
            .dispatch('query', { schema: {
                repo: 'string',
                options: Schema.nest({
                    nodes: { nullable: 'array' },
                    global: { nullable: 'boolean' },
                    keys: { nullable: 'array' }
                })
            } })
        ;
    },

    'neuron:register': function (req, params) {
        this._registry.add(req.src, params.name);
        this.repos.repo(params.name, true);
        req.ok();
    },

    'neuron:unregister': function (req, params) {
        this._registry.remove(req.src, params.name);
        if (!this._registry.all(params.name, 'repo')) {
            this.repos.remove(params.name);
        }
        req.ok();
    },

    'neuron:local.set': function (req, params) {
        this._withRepo(req, function (repo) {
            repo.updateLocal(params.data, req.done);
        });
    },

    'neuron:global.set': function (req, params) {
        this._withRepo(req, function (repo) {
            repo.updateGlobal(params.data, req.done);
        });
    },

    'neuron:query': function (req, params) {
        this._withRepo(req, function (repo) {
            repo.query(params.options, req.done);
        });
    },

    _withRepo: function (req, logic) {
        var repo = this.repos.repo(req.data.repo);
        if (repo) {
            logic.call(this, repo);
        } else {
            req.fail(Errors.nonexist(req.data.repo));
        }
    },

    _castByRepo: function (repo, msg) {
        var ids = this._registry.keys(repo.name, 'repo');
        if (ids.length > 0) {
            this.neuron.cast(msg, {
                target: ids
            });
        }
    },

    onDisconnect: function (id) {
        var names = this._registry.keys(id, 'id');
        this._registry.removeAll(id, 'id');
        names.forEach(function (name) {
            if (!this._registry.all(name, 'repo')) {
                this.repos.remove(name);
            }
        }, this);
    },

    onCentralized: function (centralized, repo) {
        this._castByRepo(repo, {
            event: 'centralized',
            data: {
                repo: repo.name,
                centralized: centralized
            }
        });
    },

    onSynchronized: function (repo) {
        this._castByRepo(repo, {
            event: 'synchronized',
            data: {
                repo: repo.name,
                revision: repo.revision
            }
        });
    }
}, {
    statics: {
        run: function () {
            new Program().run();
        }
    }
});

module.exports = Program;
*/

var Class    = require('js-class'),
    flow     = require('js-flow'),
    elements = require('evo-elements'),
    BiMap    = elements.BiMap,
    Errors   = elements.Errors,
    neuron   = require('evo-neuron'),
    idioms   = require('evo-idioms'),

    States = require('./States');

var Program = Class(neuron.Program, {
    constructor: function () {
        neuron.Program.prototype.constructor.call(this, 'states', { neuron: { connects: ['connector'] } });
        this.connector = new idioms.ConnectorClient(this.neuron);
        this.connector
            .on('state', this.onClusterState.bind(this))
            .on('update', this.onClusterUpdate.bind(this))
            .on('request', this.onClusterRequest.bind(this))
            .on('message', this.onClusterMessage.bind(this))
        ;
        this._states = new States(this, this.logger, this.options);
        this._states
            .on('centralized', this.onCentralized.bind(this))
            .on('updated', this.onUpdated.bind(this))
        ;

        this._watches = new BiMap('id', 'key');

        this
            .dispatch('watch', { schema: { watches: { nullable: 'object' }, none: { nullable: 'boolean' } } })
            .dispatch('local.set')
            .dispatch('global.set')
            .dispatch('query', { schema: { key: { nullable: 'string' }, node: { nullable: 'string' } } })
        ;
    },

    'neuron:watch': function (req, params) {
        if (typeof(params.watches) == 'object') {
            for (var key in params.watches) {
                params.watches[key] ? this._watches.add(req.src, key, true) : this._watches.remove(req.src, key);
            }
        } else if (params.none == true) {
            this._watches.removeAll(req.src, 'id');
        }
        req.ok({
            keys: this._watches.keys(req.src, 'id'),
            mode: this._states.mode,
            centralized: this._states.centralized,
            revision: this._states.revision
        });
    },

    'neuron:local.set': function (req) {
        if (typeof(req.data) == 'object') {
            this._states.localCommit(req.data, req.done);
        } else {
            req.fail(Errors.badParam('data'));
        }
    },

    'neuron:global.set': function (req) {
        if (typeof(req.data) == 'object') {
            this._states.globalCommit(req.data, req.done);
        } else {
            req.fail(Errors.badParam('data'));
        }
    },

    'neuron:query': function (req, params) {
        this._states.query(params.key, params.node, req.done);
    },

    // Implement IClusterConnector

    get localId () {
        return this.connector.localId;
    },

    message: function (event, data, dst) {
        this.connector.send({ event: event, data: data }, dst);
    },

    request: function (event, data, callback) {
        this.connector.remoteRequest({ event: event, data: data }, 'master', callback);
    },

    // Events

    onDisconnect: function (id) {
        this._watches.removeAll(id, 'id');
    },

    onClusterState: function (state) {
        this._states.mode = (state == 'master' || state == 'announcing') ? States.MASTER : States.SLAVE;
    },

    onClusterUpdate: function (clusterInfo) {
        this._states.nodesUpdate(clusterInfo.nodes.map(function (node) { return node.id }));
    },

    onClusterRequest: function (req) {
        this._states.clusterRequest(req.event, req.data, req.origin && req.origin.src, req.done);
    },

    onClusterMessage: function (msg, src) {
        this._states.clusterMessage(msg.event, msg.data, src);
    },

    onCentralized: function (rev) {
        this.neuron.cast({ event: 'centralized', data: { revision: rev } });
    },

    onUpdated: function (rev, changes) {
        var notifies = new BiMap('id', 'key');
        for (var key in changes) {
            this._watches.keys(key, 'key').forEach(function (id) {
                notifies.add(id, key, true);
            });
        }
        var idmap = notifies.map('id');
        for (var id in idmap) {
            this.neuron.cast({ event: 'changes', data: { keys: Object.keys(idmap[id]) } }, { target: id });
        }
        this.neuron.cast({ event: 'updated', data: { revision: rev } });
    }
}, {
    statics: {
        run: function () {
            new Program().run();
        }
    }
});

module.exports = Program;
