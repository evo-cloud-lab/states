var Class = require('js-class'),
    _     = require('underscore'),
    Utils = require('evo-elements').Utils,

    QueryBase = require('./QueryBase');

var Query = Class(QueryBase, {
    constructor: function (host, logger, options) {
        QueryBase.prototype.constructor.apply(this, arguments);
    },

    queryAll: function (options, callback) {
        var result = this.host.states();
        if (options.nodes) {
            var diff = Utils.diff(options.nodes, Object.keys(result.nodes));
            // remove state if not requested
            for (var i in diff[1]) {
                delete result.nodes[diff[1][i]].d;
            }
        }
        if (options.global === false) {
            delete result.global.d;
        }
        if (Array.isArray(options.keys)){
            for (var id in result.nodes) {
                if (result.nodes[id].d) {
                    result.nodes[id].d = Utils.onlyKeys(_.clone(result.nodes[id].d), options.keys);
                }
            }
            if (result.global.d) {
                result.global.d = Utils.onlyKeys(_.clone(result.global.d), options.keys);
            }
        }
        callback && callback(null, result);
        return result;
    }
});

module.exports = Query;
