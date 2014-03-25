/** @fileoverview
 * Provide NodeStates
 */

var Class = require('js-class'),
    Utils = require('evo-elements').Utils,

    TrackedStates = require('./TrackedStates');

/** @class NodeStates
 * The instance manages local states of each node
 */
var NodeStates = Class({
    constructor: function () {
        this._nodes = {};
    },

    /** @function
     * @description retrieve node state
     */
    state: function (nodeId) {
        var node = this._nodes[nodeId];
        return node ? node.state() : undefined;
    },

    /** @function
     * @description list all nodes' states
     */
    states: function () {
        var states = {};
        for (var id in this._nodes) {
            states[id] = this._nodes[id].state();
        }
        return states;
    },

    /** @function
     * @description find new/removed node Ids
     */
    diffNodes: function (nodeIds) {
        var diff = Utils.diff(Object.keys(this._nodes),
                              Array.isArray(nodeIds) ? nodeIds : Object.keys(nodeIds));
        return diff[0].length > 0 || diff[1].length > 0 ? { del: diff[0], add: diff[1] } : null;
    },

    /** @function
     * @description sync available nodes
     *
     * Nodes which is absent from "nodeIds" are removed.
     *
     * @param {Array/object} nodeIds when is array, it is ids of nodes,
     *                               when is object, keys are node ids
     */
    syncNodes: function (nodeIds, revision) {
        var diff = this.diffNodes(nodeIds);
        if (diff) {
            for (var i in diff.del) {
                delete this._nodes[diff.del[i]];
            }
            for (var i in diff.add) {
                this._nodes[diff.add[i]] = new TrackedStates(revision);
            }
        }
        return diff;
    },

    /** @function
     * @description sync states reported by a node
     * @param {String} nodeId   The node id
     * @param {object} states   state exported by TrackedStates
     * @param revision   (optional) specify the revision to set
     */
    sync: function (nodeId, state, revision) {
        var node = this._nodes[nodeId];
        node || (node = this._nodes[nodeId] = new TrackedStates());
        return node.sync(state, revision);
    }
});

module.exports = NodeStates;
