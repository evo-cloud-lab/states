/** @fileoverview
 * Provide RepoManager
 */

var Class = require('js-class'),
    elements = require('evo-elements'),
    Logger   = elements.Logger,
    Errors   = elements.Errors,
    idioms   = require('evo-idioms'),

    Repository = require('./Repository');

var RepoManager = Class(process.EventEmitter, {
    constructor: function (connector, logger, options) {
        this.options = options;
        this.logger  = Logger.wrap(logger);

        this.connector = connector;

        (this._connStates = new idioms.ConnectorStates(this._connector, {
            master: {
                enter:  this._masterEnter,
                leave:  this._masterLeave,
                update: this._masterUpdate,
                'msg:centralize.ack':       this._centralizeAck,
                'req:states.query':         this._queryStates,
                'req:states.sync':          this._syncChanges,
                'req:states.update.local':  this._updateLocal,
                'req:states.update.global': this._updateGlobal
            },
            default: {
                'msg:states.centralize': this._centralize,
                'msg:states.announce':   this._sync
            },
            context: this
        })).start();

        this._repos = {};
    },

    // External APIs
    repo: function (name, create) {
        var repo = this._repos[name];
        if (!repo && create) {
            repo = this._repos[name] = new Repository(name, this);
        }
        return repo;
    },

    remove: function (name) {
        var repo = this._repos[name];
        delete this._repos[name];
        repo && repo.destroy();
        return repo != null;
    },

    // Events
    _masterEnter: function () {
        this._masterMode(true);
    },

    _masterLeave: function () {
        this._masterMode(false);
    },

    _masterUpdate: function (clusterInfo) {
        var nodeIds = clusterInfo.nodes.map(function (node) { return node.id });
        for (var name in this._repos) {
            this._repos[name].clusterUpdated(nodeIds);
        }
    },

    _centralizeAck: function (msg, src) {
        this._withRepo(msg, function (repo) {
            repo.centralizeAck(src, msg.data);
        });
    },

    _queryStates: function (req) {
        this._withRepo(req, function (repo) {
            req.ok(repo.masterQuery(req.data.options));
        });
    },

    _syncChanges: function (req) {
        this._withRepo(req, function (repo) {
            req.ok(repo.changes(repo.data.r));
        });
    },

    _updateLocal: function (req) {
        this._withRepo(req, function (repo) {
            repo.updateNode(req.origin.src, req.data.state, req.done);
        });
    },

    _updateGlobal: function (req) {
        this._withRepo(req, function (repo) {
            repo.updateGlobal(req.data.data, req.done);
        });
    },

    _masterMode: function (master) {
        for (var name in this._repos) {
            this._repos[name].masterMode(master);
        }
    },

    _centralize: function (msg) {
        this._withRepo(msg, function (repo) {
            repo.slaveCentralize(msg.data.r);
        });
    },

    _sync: function (msg) {
        this._withRepo(msg, function (repo) {
            repo.slaveSync(msg.data.r);
        });
    },

    _withRepo: function (name, logic) {
        var msg = typeof(name) == 'object' ? name : null;
        msg && (name = msg.data.repo);
        var repo = this._repos[name];
        if (repo) {
            logic.call(this, repo);
        } else if (msg && msg.origin) { // a request
            msg.fail(Errors.nonexist(msg.data.repo));
        }
    },

    _repoSynced: function (repo) {
        this.emit('synchronized', repo);
    },

    _repoCentralize: function (centralized, repo) {
        this.emit('centralized', centralized, repo);
    }
});

module.exports = RepoManager;
