/** @fileoverview
 * Provide ClusterValues
 */
var Class = require('js-class'),
    elements = require('evo-elements'),
    BiMap = elements.BiMap,
    Utils = elements.Utils,

    RevValue = require('./RevValue');

var ClusterValues = Class(RevValue, {
    constructor: function (trackDeletion) {
        RevValue.prototype.constructor.call(this, new BiMap('key', 'node'));
        this._trackDeletion = trackDeletion;
    },

    get nodes () {
        return Object.keys(this.val.map('node'));
    },

    query: function (key, node) {
        if (key != null && node != null) {
            var result = this.val.get(key, node);
            return result && !result.deleted ? result.toObject() : null;
        } else if (key == null && node == null) {
            return this.toObject();
        } else {
            var dict = key != null ? this.val.all(key, 'key') : this.val.all(node, 'node');
            if (dict == null) {
                return null;
            }
            var result = {};
            for (var k in dict) {
                if (dict[k] && !dict[k].deleted) {
                    result[k] = dict[k].toObject();
                }
            }
            return { d: result, r: this.rev };
        }
    },

    update: function (key, node, val) {
        if (!(val instanceof RevValue)) {
            throw Error('val must be RevValue');
        }
        this.val.add(key, node, val);
        this.changed();
        return this;
    },

    remove: function (key, node) {
        var val = this.val.get(key, node);
        if (val)
        {
            this._trackDeletion ? (val.deleted = true) : this.val.remove(key, node);
            this.changed();
        }
        return this;
    },

    merge: function (values) {
        var changes = {}, rev = this._rev + 1, byKeys = values.val.map('key');
        for (var key in byKeys) {
            var nodes = byKeys[key];
            for (var id in nodes) {
                nodes[id].deleted ? this.remove(key, id) : this.update(key, id, nodes[id]);
                var ids = changes[key];
                ids || (ids = changes[key] = []);
                ids.push(id);
            }
        }
        Object.keys(changes).length > 0 && (this._rev = rev);
        return changes;
    },

    sync: function (node, object, rev) {
        if (object instanceof RevValue) {
            rev == null && (rev = object.rev);
            object = object.val;
        }
        for (var key in object) {
            if (object[key] == null) {
                this.val.remove(key, node);
            } else {
                var val = this.val.get(key, node);
                if (val) {
                    val.update(object[key], rev);
                } else {
                    this.val.add(key, node, new RevValue(object[key], rev));
                }
            }
        }
        this.changed();
        return this;
    },

    clusterUpdate: function (nodeIds) {
        var diff = Utils.diff(Object.keys(this.val.map('node')), nodeIds);
        diff[0].forEach(function (id) {
            this.val.removeAll(id, 'node');
        }, this);
        this.changed();
        return this;
    },

    toObject: function () {
        var obj = {
            d: {
                keys:  Object.keys(this.val.map('key')),
                nodes: Object.keys(this.val.map('node')),
                vals:  []
            },
            r: this.rev
        };
        obj.d.keys.forEach(function (key) {
            obj.d.nodes.forEach(function (id) {
                var val = this.val.get(key, id);
                obj.d.vals.push(val && val.toObject());
            }, this);
        }, this);
        return obj;
    },

    reload: function (object) {
        var changes = {};
        if (object.d && object.r != null &&
            Array.isArray(object.d.keys) &&
            Array.isArray(object.d.nodes) &&
            Array.isArray(object.d.vals)) {
            var origVal = this._val, val = new BiMap('key', 'node'), i = 0;
            object.d.keys.forEach(function (key) {
                object.d.nodes.forEach(function (id) {
                    var v = object.d.vals[i];
                    v != null && val.add(key, id, new RevValue(v.d, v.r));
                    i ++;
                    // find changes
                    var orig = origVal.get(key, id);
                    if (!((orig != null && v != null && (orig.r == v.r)) ||
                          (orig == null && v == null))) {
                        var ids = changes[key];
                        ids || (ids = changes[key] = []);
                        ids.push(id);
                    }
                });
            });
            this._val = val;
            this._rev = object.r;

            // find removed keys
            var diff = Utils.diff(Object.keys(origVal.map('key')), Object.keys(val.map('key')));
            diff[0].forEach(function (key) {
                changes[key] = null;
            });
        }
        return changes;
    }
});

module.exports = ClusterValues;
