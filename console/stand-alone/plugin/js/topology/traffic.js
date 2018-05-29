/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/
'use strict';

/* global d3 ChordData MIN_CHORD_THRESHOLD Promise */

const transitionDuration = 1000;
const CHORDFILTERKEY = 'chordFilter';

function Traffic ($scope, $timeout, QDRService, converter, radius, topology, nextHop, type, prefix) {
  $scope.addressColors = {};
  this.QDRService = QDRService;
  this.type = type; // moving dots or colored path
  this.prefix = prefix; // url prefix used in svg url()s
  this.topology = topology; // contains the list of router nodes
  this.nextHop = nextHop; // fn that returns the route through the network between two routers
  this.$scope = $scope;
  this.$timeout = $timeout;
  // internal variables
  this.interval = null; // setInterval handle
  this.setAnimationType(type, converter, radius);
}

// stop updating the traffic data
Traffic.prototype.stop = function () {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = null;
  }
};
// start updating the traffic data
Traffic.prototype.start = function () {
  this.doUpdate();
  this.interval = setInterval(this.doUpdate.bind(this), transitionDuration);
};
// remove any animations that are in progress
Traffic.prototype.remove = function() {
  if (this.vis)
    this.vis.remove();
};
// called when one of the address checkboxes is toggled
Traffic.prototype.setAnimationType = function (type, converter, radius) {
  this.stop();
  this.remove();
  this.type = type;
  this.vis = type === 'dots' ? new Dots(this, converter, radius) :
    new Congestion(this);
};
// called periodically to refresh the traffic flow
Traffic.prototype.doUpdate = function () {
  this.vis.doUpdate();
};
Traffic.prototype.connectionPopupHTML = function (onode, conn, d) {
  return this.vis.connectionPopupHTML(onode, conn, d);
};

/* Base class for congestion and dots visualizations */
function TrafficAnimation (traffic) {
  this.traffic = traffic;
}
TrafficAnimation.prototype.nodeIndexFor = function (nodes, name) {
  for (let i=0; i<nodes.length; i++) {
    let node = nodes[i];
    if (node.container === name)
      return i;
  }
  return -1;
};
TrafficAnimation.prototype.connectionPopupHTML = function () {
  return null;
};

/* Color the links between router to show how heavily used the links are. */
function Congestion (traffic) {
  TrafficAnimation.call(this, traffic);
  this.init_markerDef();
}
Congestion.prototype = Object.create(TrafficAnimation.prototype);
Congestion.prototype.constructor = Congestion;

Congestion.prototype.init_markerDef = function () {
  this.custom_markers_def = d3.select('#SVG_ID').select('defs.custom-markers');
  if (this.custom_markers_def.empty()) {
    this.custom_markers_def = d3.select('#SVG_ID').append('svg:defs').attr('class', 'custom-markers');
  }
};
Congestion.prototype.findResult = function (node, entity, attribute, value) {
  let attrIndex = node[entity].attributeNames.indexOf(attribute);
  if (attrIndex >= 0) {
    for (let i=0; i<node[entity].results.length; i++) {
      if (node[entity].results[i][attrIndex] === value) {
        return this.traffic.QDRService.utilities.flatten(node[entity].attributeNames, node[entity].results[i]);
      }
    }
  }
  return null;
};
Congestion.prototype.doUpdate = function () {
  let self = this;
  this.traffic.QDRService.management.topology.ensureAllEntities(
    [{ entity: 'router.link', force: true},{entity: 'connection'}], function () {
      let links = {};
      let nodeInfo = self.traffic.QDRService.management.topology.nodeInfo();
      // accumulate all the inter-router links in an object
      // keyed by the svgs path id
      for (let nodeId in nodeInfo) {
        let node = nodeInfo[nodeId];
        let nodeLinks = node['router.link'];
        for (let n=0; n<nodeLinks.results.length; n++) {
          let link = self.traffic.QDRService.utilities.flatten(nodeLinks.attributeNames, nodeLinks.results[n]);
          if (link.linkType !== 'router-control') {
            let f = self.nodeIndexFor(self.traffic.topology.nodes, 
              self.traffic.QDRService.management.topology.nameFromId(nodeId));
            let connection = self.findResult(node, 'connection', 'identity', link.connectionId);
            if (connection) {
              let t = self.nodeIndexFor(self.traffic.topology.nodes, connection.container);
              let little = Math.min(f, t);
              let big = Math.max(f, t);
              let key = ['#path', little, big].join('-');
              if (!links[key])
                links[key] = [];
              links[key].push(link);
            }
          }
        }
      }
      // accumulate the colors/directions to be used
      let colors = {};
      for (let key in links) {
        let congestion = self.congestion(links[key]);
        let path = d3.select(key);
        if (path && !path.empty()) {
          let dir = path.attr('marker-end') === '' ? 'start' : 'end';
          let small = path.attr('class').indexOf('small') > -1;
          let id = dir + '-' + congestion.substr(1) + (small ? '-s' : '');
          colors[id] = {dir: dir, color: congestion, small: small};
          path
            .attr('stroke', congestion)
            .classed('traffic', true)
            .attr('marker-start', function(d) {
              return d.left ? 'url(' + self.traffic.prefix + '#' + id + ')' : '';
            })
            .attr('marker-end', function(d) {
              return d.right ? 'url(' + self.traffic.prefix + '#' + id + ')' : '';
            });
        }
      }

      // create the svg:def that holds the custom markers
      self.init_markerDef();

      let colorKeys = Object.keys(colors);
      let custom_markers = self.custom_markers_def.selectAll('marker')
        .data(colorKeys, function (d) {return d;});

      custom_markers.enter().append('svg:marker')
        .attr('id', function (d) { return d; })
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', function (d) {
          return colors[d].dir === 'end' ? 24 : (colors[d].small) ? -24 : -14;
        })
        .attr('markerWidth', 4)
        .attr('markerHeight', 4)
        .attr('orient', 'auto')
        .style('fill', function (d) {return colors[d].color;})
        .append('svg:path')
        .attr('d', function (d) {
          return colors[d].dir === 'end' ? 'M 0 -5 L 10 0 L 0 5 z' : 'M 10 -5 L 0 0 L 10 5 z';
        });
      custom_markers.exit().remove();

    });
};
Congestion.prototype.congestion = function (links) {
  let v = 0;
  for (let l=0; l<links.length; l++) {
    let link = links[l];
    v = Math.max(v, (link.undeliveredCount+link.unsettledCount)/link.capacity);
  }
  return this.fillColor(v);
};
Congestion.prototype.fillColor = function (v) {
  let color = d3.scale.linear().domain([0, 1, 2, 3])
    .interpolate(d3.interpolateHcl)
    .range([d3.rgb('#CCCCCC'), d3.rgb('#00FF00'), d3.rgb('#FFA500'), d3.rgb('#FF0000')]);
  return color(v);
};
Congestion.prototype.remove = function () {
  d3.select('#SVG_ID').selectAll('path.traffic')
    .classed('traffic', false);
  d3.select('#SVG_ID').select('defs.custom-markers')
    .selectAll('marker').remove();
};

// construct HTML to be used in a popup when the mouse is moved over a link.
// The HTML is sanitized elsewhere before it is displayed
Congestion.prototype.connectionPopupHTML = function (onode, conn, d) {
  const max_links = 10;
  const fields = ['undelivered', 'unsettled', 'rejected', 'released', 'modified'];
  // local function to determine if a link's connectionId is in any of the connections
  let isLinkFor = function (connectionId, conns) {
    for (let c=0; c<conns.length; c++) {
      if (conns[c].identity === connectionId)
        return true;
    }
    return false;
  };
  let fnJoin = function (ar, sepfn) {
    let out = '';
    out = ar[0];
    for (let i=1; i<ar.length; i++) {
      let sep = sepfn(ar[i]);
      out += (sep[0] + sep[1]);
    }
    return out;
  };
  let conns = [conn];
  // if the data for the line is from a client (small circle), we may have multiple connections
  if (d.cls === 'small') {
    conns = [];
    let normals = d.target.normals ? d.target.normals : d.source.normals;
    for (let n=0; n<normals.length; n++) {
      if (normals[n].resultIndex !== undefined) {
        conns.push(this.traffic.QDRService.utilities.flatten(onode['connection'].attributeNames,
          onode['connection'].results[normals[n].resultIndex]));
      }
    }
  }
  // loop through all links for this router and accumulate those belonging to the connection(s)
  let nodeLinks = onode['router.link'];
  let links = [];
  let hasAddress = false;
  for (let n=0; n<nodeLinks.results.length; n++) {
    let link = this.traffic.QDRService.utilities.flatten(nodeLinks.attributeNames, nodeLinks.results[n]);
    if (link.linkType !== 'router-control') {
      if (isLinkFor(link.connectionId, conns)) {
        if (link.owningAddr)
          hasAddress = true;
        links.push(link);
      }
    }
  }
  // we may need to limit the number of links displayed, so sort descending by the sum of the field values
  links.sort( function (a, b) {
    let asum = a.undeliveredCount + a.unsettledCount + a.rejectedCount + a.releasedCount + a.modifiedCount;
    let bsum = b.undeliveredCount + b.unsettledCount + b.rejectedCount + b.releasedCount + b.modifiedCount;
    return asum < bsum ? 1 : asum > bsum ? -1 : 0;
  });
  let HTMLHeading = '<h4>Links</h4>';
  let HTML = '<table class="popupTable">';
  // copy of fields since we may be prepending an address
  let th = fields.slice();
  // convert to actual attribute names
  let td = fields.map( function (f) {return f + 'Count';});
  th.unshift('dir');
  td.unshift('linkDir');
  // add an address field if any of the links had an owningAddress
  if (hasAddress) {
    th.unshift('address');
    td.unshift('owningAddr');
  }
  // add rows to the table for each link
  HTML += ('<tr><td>' + th.join('</td><td>') + '</tr></td>');
  for (let l=0; l<links.length; l++) {
    if (l>=max_links) {
      HTMLHeading = '<h4>Top ' + max_links + ' Links</h4>';
      break;
    }
    let link = links[l];
    let vals = td.map( function (f) {
      if (f === 'owningAddr') {
        let identity = this.traffic.QDRService.utilities.identity_clean(link.owningAddr);
        return this.traffic.QDRService.utilities.addr_text(identity);
      }
      return link[f];
    }.bind(this));
    let joinedVals = fnJoin(vals, function (v1) {
      return ['</td><td' + (isNaN(+v1) ? '': ' align="right"') + '>', this.traffic.QDRService.utilities.pretty(v1 || '0')];
    }.bind(this));
    HTML += ('<tr><td>' + joinedVals + '</td></tr>');
  }
  HTML += '</table>';
  return HTMLHeading + HTML;
};

/* Create animated dots moving along the links between routers
   to show message flow */
function Dots (traffic, converter, radius) {
  TrafficAnimation.call(this, traffic);
  this.excludedAddresses = localStorage[CHORDFILTERKEY] ? JSON.parse(localStorage[CHORDFILTERKEY]) : [];
  this.radius = radius; // the radius of a router circle
  this.lastFlows = {}; // the number of dots animated between routers
  this.chordData = new ChordData(this.traffic.QDRService, true, converter); // gets ingressHistogram data
  this.chordData.setFilter(this.excludedAddresses);
  traffic.$scope.addresses = {};
  this.chordData.getMatrix().then(function () {
    this.traffic.$timeout(function () {
      this.traffic.$scope.addresses = this.chordData.getAddresses();
      for (let address in this.traffic.$scope.addresses) {
        this.fillColor(address);
      }
    }.bind(this));
  }.bind(this));
  // colors
  this.colorGen = d3.scale.category10();
  let self = this;
  // event notification that an address checkbox has changed
  traffic.$scope.addressFilterChanged = function () {
    self.updateAddresses()
      .then(function () {
      // don't wait for the next polling cycle. update now
        self.traffic.stop();
        self.traffic.start();
      });
  };
  // called by angular when mouse enters one of the address legends
  traffic.$scope.enterLegend = function (address) {
    // fade all flows that aren't for this address
    self.fadeOtherAddresses(address);
  };
  // called when the mouse leaves one of the address legends
  traffic.$scope.leaveLegend = function () {
    self.unFadeAll();
  };
  // clicked on the address name. toggle the address checkbox
  traffic.$scope.addressClick = function (address) {
    self.toggleAddress(address)
      .then(function () {
        self.updateAddresses();
      });
  };
}
Dots.prototype = Object.create(TrafficAnimation.prototype);
Dots.prototype.constructor = Dots;

Dots.prototype.remove = function () {
  for (let id in this.lastFlows) {
    d3.select('#SVG_ID').selectAll('circle.flow' + id).remove();
  }
  this.lastFlows = {};
};
Dots.prototype.updateAddresses = function () {
  this.excludedAddresses = [];
  for (let address in this.traffic.$scope.addresses) {
    if (!this.traffic.$scope.addresses[address])
      this.excludedAddresses.push(address);
  }
  localStorage[CHORDFILTERKEY] = JSON.stringify(this.excludedAddresses);
  if (this.chordData)
    this.chordData.setFilter(this.excludedAddresses);
  return new Promise(function (resolve) {
    return resolve();
  });
};
Dots.prototype.toggleAddress = function (address) {
  this.traffic.$scope.addresses[address] = !this.traffic.$scope.addresses[address];
  return new Promise(function (resolve) {
    return resolve();
  });
};
Dots.prototype.fadeOtherAddresses = function (address) {
  d3.selectAll('circle.flow').classed('fade', function (d) {
    return d.address !== address;
  });
};
Dots.prototype.unFadeAll = function () {
  d3.selectAll('circle.flow').classed('fade', false);
};
Dots.prototype.doUpdate = function () {
  let self = this;
  // we need the nextHop data to show traffic between routers that are connected by intermediaries
  this.traffic.QDRService.management.topology.ensureAllEntities([{ entity: 'router.node', attrs: ['id', 'nextHop'] }], function () {
    // get the ingressHistogram data for all routers
    self.chordData.getMatrix().then(self.render.bind(self), function (e) {
      console.log('Could not get message histogram' + e);
    });
  });
};
Dots.prototype.render = function (matrix) {
  this.traffic.$timeout(function () {
    this.traffic.$scope.addresses = this.chordData.getAddresses();
  }.bind(this));
  // get the rate of message flow between routers
  let hops = {}; // every hop between routers that is involved in message flow
  let matrixMessages = matrix.matrixMessages();
  // the fastest traffic rate gets 3 times as many dots as the slowest
  let minmax = matrix.getMinMax();
  let flowScale = d3.scale.linear().domain(minmax).range([1, 1.75]);
  // row is ingress router, col is egress router. Value at [row][col] is the rate
  matrixMessages.forEach(function (row, r) {
    row.forEach(function (val, c) {
      if (val > MIN_CHORD_THRESHOLD) {
        // translate between matrix row/col and node index
        let f = this.nodeIndexFor(this.traffic.topology.nodes, matrix.rows[r].egress);
        let t = this.nodeIndexFor(this.traffic.topology.nodes, matrix.rows[r].ingress);
        let address = matrix.getAddress(r, c);
        if (r !== c) {
          // accumulate the hops between the ingress and egress routers
          this.traffic.nextHop(this.traffic.topology.nodes[f], this.traffic.topology.nodes[t], function (link, fnode, tnode) {
            let key = '-' + link.uid;
            let back = fnode.index < tnode.index;
            if (!hops[key])
              hops[key] = [];
            hops[key].push({ val: val, back: back, address: address });
          });
        }
        // Find the senders connected to nodes[f] and the receivers connected to nodes[t]
        // and add their links to the animation
        this.addClients(hops, this.traffic.topology.nodes, f, val, true, address);
        this.addClients(hops, this.traffic.topology.nodes, t, val, false, address);
      }
    }.bind(this));
  }.bind(this));
  // for each link between routers that has traffic, start an animation
  let keep = {};
  for (let id in hops) {
    let hop = hops[id];
    for (let h = 0; h < hop.length; h++) {
      let ahop = hop[h];
      let flowId = id + '-' + this.addressIndex(this, ahop.address) + (ahop.back ? 'b' : '');
      let path = d3.select('#path' + id);
      // start the animation. If the animation is already running, this will have no effect
      this.startAnimation(path, flowId, ahop, flowScale(ahop.val));
      keep[flowId] = true;
    }
  }
  // remove any existing animations that we don't have data for anymore
  for (let id in this.lastFlows) {
    if (this.lastFlows[id] && !keep[id]) {
      this.lastFlows[id] = 0;
      d3.select('#SVG_ID').selectAll('circle.flow' + id).remove();
    }
  }
};
// animate the d3 selection (flow) along the given path
Dots.prototype.animateFlow = function (flow, path, count, back, rate) {
  let self = this;
  let l = path.node().getTotalLength();
  flow.transition()
    .ease('easeLinear')
    .duration(l * 10 / rate)
    .attrTween('transform', self.translateDots(self.radius, path, count, back))
    .each('end', function () { self.animateFlow(flow, path, count, back, rate); });
};
// create dots along the path between routers
Dots.prototype.startAnimation = function (path, id, hop, rate) {
  if (!path.node())
    return;
  this.animateDots(path, id, hop, rate);
};
Dots.prototype.animateDots = function (path, id, hop, rate) {
  let back = hop.back, address = hop.address;
  // the density of dots is determined by the rate of this traffic relative to the other traffic
  let len = Math.max(Math.floor(path.node().getTotalLength() / 50), 1);
  let dots = [];
  for (let i = 0, offset = this.addressIndex(this, address); i < len; ++i) {
    dots[i] = { i: i + 10 * offset, address: address };
  }
  // keep track of the number of dots for each link. If the length of the link is changed,
  // re-create the animation
  if (!this.lastFlows[id])
    this.lastFlows[id] = len;
  else {
    if (this.lastFlows[id] !== len) {
      this.lastFlows[id] = len;
      d3.select('#SVG_ID').selectAll('circle.flow' + id).remove();
    }
  }
  let flow = d3.select('#SVG_ID').selectAll('circle.flow' + id)
    .data(dots, function (d) { return d.i + d.address; });
  let circles = flow
    .enter().append('circle')
    .attr('class', 'flow flow' + id)
    .attr('fill', this.fillColor(address))
    .attr('r', 5);
  this.animateFlow(circles, path, dots.length, back, rate);
  flow.exit()
    .remove();
};
Dots.prototype.fillColor = function (n) {
  if (!(n in this.traffic.$scope.addressColors)) {
    let ci = Object.keys(this.traffic.$scope.addressColors).length;
    this.traffic.$scope.addressColors[n] = this.colorGen(ci);
  }
  return this.traffic.$scope.addressColors[n];
};
Dots.prototype.addClients = function (hops, nodes, f, val, sender, address) {
  let cdir = sender ? 'out' : 'in';
  for (let n=0; n<nodes.length; n++) {
    let node = nodes[n];
    if (node.normals && node.key === nodes[f].key && node.cdir === cdir) {
      let key = ['',f,n].join('-');
      if (!hops[key])
        hops[key] = [];
      hops[key].push({val: val, back: node.cdir === 'in', address: address});
      return;
    }
  }
};
Dots.prototype.addressIndex = function (vis, address) {
  return Object.keys(vis.traffic.$scope.addresses).indexOf(address);
};
// calculate the translation for each dot along the path
Dots.prototype.translateDots = function (radius, path, count, back) {
  let pnode = path.node();
  // will be called for each element in the flow selection (for each dot)
  return function(d) {
    // will be called with t going from 0 to 1 for each dot
    return function(t) {
      // start the points at different positions depending on their value (d)
      let tt = t * 1000;
      let f = ((tt + (d.i*1000/count)) % 1000)/1000;
      if (back)
        f = 1 - f;
      // l needs to be calculated each tick because the path's length might be changed during the animation
      let l = pnode.getTotalLength();
      let p = pnode.getPointAtLength(f * l);
      return 'translate(' + p.x + ',' + p.y + ')';
    };
  };
};
