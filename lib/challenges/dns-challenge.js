// Copyright (c) 2016 the rocket-skates AUTHORS.  All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

'use strict';

const crypto   = require('crypto');
const basicDNS = require('dns');
const dns      = require('native-dns');

class DNS01Challenge {
  constructor(name, thumbprint) {
    this.status = 'pending';
    this.name = name;

    this.server = DNS01Challenge.resolver;
    if (this.server === 'auto') {
      this.server = basicDNS.getServers()[0];
    }

    this.token = crypto.randomBytes(32).toString('base64')
                       .replace(/\//g, '_').replace(/\+/g, '-')
                       .replace(/=/g, '');
    this._keyAuthorization = this.token + '.' + thumbprint;
    this._keyAuthorizationHash = crypto.createHash('sha256')
                                       .update(this._keyAuthorization, 'utf8')
                                       .digest('base64')
                                       .replace(/\//g, '_').replace(/\+/g, '-')
                                       .replace(/=/g, '');

    // Expose this for testing
    this._dns = dns;
  }

  update(response) {
    if (!response.type || (response.type !== DNS01Challenge.type) ||
        !response.keyAuthorization ||
        (response.keyAuthorization !== this._keyAuthorization)) {
      this.status = 'invalid';
      return Promise.resolve(this);
    }

    this.keyAuthorization = this._keyAuthorization;

    let authName = '_acme-challenge.' + this.name;
    let req = dns.Request({
      question: dns.Question({name: authName, type: 'TXT'}),
      server:   {
        address: DNS01Challenge.resolver,
        port:    DNS01Challenge.port,
        type:    'udp'
      },
      timeout: 1000
    });

    return new Promise((resolve, reject) => {
      req.on('timeout', () => { reject('timeout'); });

      req.on('message', (err, answer) => {
        if (err) {
          reject(err);
        }

        let results = answer.answer.map(a => {
          if (!a.data || !(a.data instanceof Array)) {
            return null;
          }
          return a.data.join('');
        })
          .filter(x => (x !== null));
        resolve(results);
      });

      req.send();
    })
      .then(records => {
        let valid = records.filter(x => (x === this._keyAuthorizationHash));
        this.status = (valid.length > 0)? 'valid' : 'invalid';
        return false;
      })
      .catch(() => {
        this.status = 'invalid';
      });
  }

  toJSON() {
    let obj = {
      type:   DNS01Challenge.type,
      status: this.status,
      token:  this.token
    };

    if (this.keyAuthorization) {
      obj.keyAuthorization = this.keyAuthorization;
    }

    return obj;
  }
}

DNS01Challenge.type = 'dns-01';
DNS01Challenge.resolver = 'auto';
DNS01Challenge.port = 53;

module.exports = DNS01Challenge;
