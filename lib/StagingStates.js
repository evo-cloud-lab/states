/** @fileoverview
 * Provide StagingStates
 */

var Class = require('js-class'),

    SharedStates = require('./SharedStates');

/** @class StagingStates
 * @description support staged updates
 * This class allows updates being routed to a staging instance to keep current
 * states stable. The staging instance is merged back to current states after
 * all nodes are synchronized.
 */
var StagingStates = Class({
    constructor: function () {
        this._stack = [new SharedStates()];
    },

    get current () {
        return this._stack[0];
    },

    get staging () {
        if (this._stack.length == 1) {
            this._stack.push(new SharedStates(this.current));
        }
        return this._stack[1];
    },

    get staged () {
        return this._stack.length > 1;
    },

    merge: function (nodes) {
        if (this.staged) {
            return this.current.merge(this._stack[1], nodes);
        }
        return false;
    }
});

module.exports = StagingStates;
