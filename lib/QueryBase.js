var Class = require('js-class');

var QueryBase = Class({
    constructor: function (host, logger, options) {
        this.host = host;
        this.logger = logger;
    },

    query: function (options, callback) {
        this.queryAll(options, function (err, states) {
            if (err) {
                callback && callback(err);
            } else {
                var result = { nodes: {} };
                for (var id in states.nodes) {
                    if (states.nodes[id].d) {
                        result.nodes[id] = states.nodes[id].d;
                    }
                }
                if (states.global.d) {
                    result.global = states.global.d;
                }
                callback && callback(null, result);
            }
        });
    }
});

module.exports = QueryBase;
