var Class = require('js-class'),
    Utils = require('evo-elements').Utils,

    QueryBase = require('./QueryBase');

var Query = Class(QueryBase, {
    constructor: function (host, logger, options) {
        QueryBase.prototype.constructor.apply(this, arguments);
    },

    queryAll: function (options, callback) {
        callback || (callback = function () { });
        this.host.queryStates(options, callback);
    }
});

module.exports = Query;
