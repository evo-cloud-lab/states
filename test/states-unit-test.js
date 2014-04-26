var Class  = require('js-class'),
    flow   = require('js-flow'),
    assert = require('assert'),
    debug  = require('debug')('test'),
    tubes  = require('evo-tubes'),

    States = require('..').States;

var StatesContainer = Class(States, {
    constructor: function (cluster, id) {
        States.prototype.constructor.call(this, this, cluster.logger, {
            'centralize-interval': 100,
            'retry-interval': 100
        });
        this.cluster = cluster;
        this.id = id;
    },

    updateCluster: function (isMaster) {
        this.mode = isMaster ? States.MASTER : States.SLAVE;
        this.nodesUpdate(this.cluster.nodes.map(function (n) { return n.id; }));
    },

    get localId () {
        return this.id;
    },

    message: function (event, data, dst) {
        this.cluster.send(this.id, { event: event, data: data }, dst);
    },

    request: function (event, data, callback) {
        this.cluster.request(this.id, { event: event, data: data }, callback);
    }
});

var Cluster = Class({
    constructor: function (nodes) {
        this.nodes = [];
        for (var i = 0; i < nodes; i ++) {
            this.nodes.push(new StatesContainer(this, i));
        }
        this.updateCluster(0);
    },

    updateCluster: function (masterId) {
        this.masterId = masterId;
        for (var i in this.nodes) {
            this.nodes[i].updateCluster(i == masterId);
        }
    },

    send: function (src, msg, dst) {
        debug('SEND [%s:%s]: %j', src == this.masterId ? 'M' : src, dst || '<all>', msg);
        dst == 'master' && (dst = this.masterId);
        if (dst == null) {
            this.nodes.forEach(function (node, index) {
                index != src && this.deliverMessage(node, msg, src);
            }, this);
        } else if (dst >= 0 && dst < this.nodes.length) {
            this.deliverMessage(this.nodes[dst], msg, src);
        }
    },

    request: function (src, msg, callback) {
        debug('REQ [%s]: %j', src == this.masterId ? 'M' : src, msg);
        (function (node) {
            setImmediate(function () {
                node.clusterRequest(msg.event, msg.data, src, function (err, result) {
                    err && debug(err);
                    !err && result && debug('RESP: [%s]: %j', src == this.masterId ? 'M' : src, result);
                    callback(err, result);
                });
            });
        })(this.nodes[this.masterId]);
    },

    deliverMessage: function (node, msg, src) {
        var next = function () {
            setImmediate(function () {
                node.clusterMessage(msg.event, msg.data, src);
            });
        };
        this.filterMessage ? this.filterMessage(node, msg, src, next) : next();
    },

    waitForConsistency: function (key, nodeId, expectedVal, done) {
        var nodes = this.nodes;
        tubes.Toolbox.until(function (done) {
            flow.each(nodes)
                .every(function (node, next) {
                    node.query(key, nodeId, function (err, val) {
                        next(err, !err && val && val.d == expectedVal);
                    });
                })
                .run(done);
        }, done);
    }
});

describe('States', function () {
    it('simple update', function (done) {
        var cluster = new Cluster(4);
        cluster.nodes[1].localCommit({ key: 'val' });
        cluster.waitForConsistency('key', 1, 'val', done);
    });

    it('centralizing', function (done) {
        var cluster = new Cluster(4);
        flow.steps()
            .next(function (next) {
                cluster.nodes[1].localCommit({ key: 'val' });
                cluster.waitForConsistency('key', 1, 'val', next);
            })
            .next(function (next) {
                var nodes = {};
                for (var index in cluster.nodes) {
                    nodes[index] = true;
                }
                flow.each(nodes)
                    .keys()
                    .every(function (index, node, next) {
                        nodes[index] = function (err) {
                            next(err, err == null);
                        };
                    })
                    .run(function (err, allOk) {
                        !err && !allOk && (err = new Error('Not all OK'));
                        next(err);
                    });
                cluster.filterMessage = function (node, msg, src, next) {
                    if (msg.event == 'states.centralize.ack') {
                        var done = nodes[src];
                        nodes[src] = null;
                        if (done) {
                            cluster.nodes[src].query('key', 1, function (err, val) {
                                flow.final(function () {
                                    assert.equal(err, null);
                                    assert.equal(val.d, 'val');
                                    next();
                                }, done);
                            });
                            return;
                        }
                    } else if (msg.event == 'states.sync') {
                        var done = nodes[0];
                        nodes[0] = null;
                        if (done) {
                            cluster.nodes[0].query('key', 1, function (err, val) {
                                flow.final(function () {
                                    assert.equal(err, null);
                                    assert.equal(val.d, 'val1');
                                    next();
                                }, done);
                            });
                            return;
                        }
                    }
                    next();
                };
                cluster.nodes[1].localCommit({ key: 'val1' });
            })
            .next(function (next) {
                cluster.waitForConsistency('key', 1, 'val1', next);
            })
            .run(done);
    });
});
