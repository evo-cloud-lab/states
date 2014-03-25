var Class    = require('js-class'),
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
