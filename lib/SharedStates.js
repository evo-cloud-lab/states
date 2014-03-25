/** @fileoverview
 * Provide SharedStates
 */

var Class = require('js-class'),

    TrackedStates = require('./TrackedStates'),
    NodeStates = require('./NodeStates');

function needSync(base, current, rev) {
    return (current >= base && rev > base) ||
            (current < base && (rev > base || rev <= current));
}

/** @class SharedStates
 * The instance of SharedStates gets synchronized across nodes
 */
var SharedStates = Class({
    constructor: function (base) {
        this._nodes  = new NodeStates();
        this._global = new TrackedStates();
        base && this._global.sync(base.global.state(), 0);
        this._globalRev = 0;
        this._revision = 0;
    },

    get nodes () {
        return this._nodes;
    },

    get global () {
        return this._global;
    },

    get revision () {
        return this._revision;
    },

    get globalChanged () {
        return this._global.revision != this._globalRev;
    },

    syncNode: function (nodeId, state) {
        var revision = this._revision + 1;
        if (this._nodes.sync(nodeId, state, revision)) {
            this._revision = revision;
            return true;
        }
        return false;
    },

    updateGlobal: function (data) {
        var revision = this._revision + 1;
        if (this._global.sync({ d: data, r: revision })) {
            this._revision = revision;
            return true;
        }
        return false;
    },

    merge: function (states, nodeIds) {
        var revision = this._revision + 1;

        var nodeStates = states.nodes.states();
        for (var id in nodeStates) {
            this._nodes.sync(id, nodeStates[id], revision);
            changed = true;
        }
        if (nodeIds && this._nodes.syncNodes(nodeIds, revision)) {
            changed = true;
        }

        if (states.globalChanged) {
            this._global.sync(states.global.state(), revision);
            changed = true;
        }

        if (changed) {
            this._revision = revision;
            this._globalRev = this._global.revision;
            return true;
        }
        return false;
    },

    changes: function (base) {
        var changes = { nodes: this._nodes.states(), r: this.revision };
        for (var id in changes.nodes) {
            var state = changes.nodes[id];
            if (!needSync(base, this.revision, state.r)) {
                delete state.d;
            }
        }
        if (needSync(base, this.revision, this._global.revision)) {
            changes.global = this._global.state();
        }
        return changes;
    },

    applyChanges: function (changes) {
        var applied;
        for (var id in changes.nodes) {
            var node = changes.nodes[id];
            if (node.d) {
                this._nodes.sync(id, node);
                applied = true;
            }
        }
        if (this._nodes.syncNodes(changes.nodes, changes.r)) {
            applied = true;
        }
        if (changes.global && this._global.sync(changes.global)) {
            applied = true;
        }
        if (applied) {
            this._revision = changes.r;
        }
        return applied;
    }
});

module.exports = SharedStates;
