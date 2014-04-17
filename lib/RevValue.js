/** @fileoverview
 * Provide RevValue
 */
var Class = require('js-class');

/** @class RevValue
 * Value with revision
 */
var RevValue = Class({
    constructor: function (data, rev) {
        this._val = data;
        this._rev = rev || 0;
    },

    get val () {
        return this._val;
    },

    get rev () {
        return this._rev;
    },

    toObject: function () {
        return { d: this._val, r: this._rev };
    },

    /** @function
     * @description update value and optionally revision
     * @param data the value to be used, if is an object, it is directly used (no copy)
     * @param rev optionally, when present, force the rev to use
     */
    update: function (data, rev) {
        this._val = data;
        if (rev != null) {
            this._rev = rev;
        } else {
            this.changed();
        }
        return this;
    },

    /** @function
     * @description merge from a plain object
     * @param {object} data the plain object, where null values indicate deletion
     */
    merge: function (data) {
        typeof(this._val) == 'object' || (this._val = {});
        for (var key in data) {
            if (data[key] == null) {
                delete this._val[key];
            } else {
                this._val[key] = data[key];
            }
        }
        this.changed();
        return this;
    },

    changed: function () {
        this._rev ++;
        return this;
    }
});

module.exports = RevValue;
