/** @fileoverview
 * Provide TrackedStates
 */

var Class = require('js-class');

/** @class TrackedStates
 * A dictionary with revision
 */
var TrackedStates = Class({
    constructor: function (initialRev) {
        this._dict = {};
        this._rev = initialRev || 0;
    },

    get revision () {
        return this._rev;
    },

    query: function (key) {
        return this._dict[key];
    },

    update: function (key, val) {
        if (typeof(key) == 'object') {
            this._dict = key;
        } else {
            if (val == null) {
                delete this._dict[key];
            } else {
                this._dict[key] = val;
            }
        }
        this._rev ++;
        return this;
    },

    remove: function (key) {
        return this.update(key);
    },

    /** @function
     * @description packaged as state
     * @return {
     *     d: dictionary,
     *     r: revision
     * }
     */
    state: function () {
        return { d: this._dict, r: this._rev };
    },

    /** @function
     * @description import state
     */
    sync: function (state, revision) {
        revision != null || (revision = state.r);
        if (state.d != null && revision != null) {
            this._dict = state.d;
            this._rev = revision;
            return true;
        }
        return false;
    }
});

module.exports = TrackedStates;
