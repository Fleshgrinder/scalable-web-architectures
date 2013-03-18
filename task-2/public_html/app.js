/**
 * @link https://github.com/videlalvaro/rabbitpubsub/blob/master/app.js
 * @author Richard Fussenegger
 */
var express = require('express');
var http = require('http');
var path = require('path');
var redis = require('redis');
var amqp = require('amqp').createConnection({});
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var chatExchange;
var redisClient = redis.createClient();
var RedisStore = require('connect-redis')(express);
var sessionStore = new RedisStore({ client: redisClient });
var cookieSecret = 'yDj9Fs7DaVVxZdZcuOh0';
var cookieParser = express.cookieParser(cookieSecret);
var SessionSocket = require('session.socket.io');
var sessionSockets = new SessionSocket(io, sessionStore, cookieParser, 'jsessionid');

var ejsHelper = (function EJSHelper() {
  var
    _projectTitle = 'AMQPChat',
    _navbarPoints = [
      { href: '/', text: 'Home' },
      { href: '/about', text: 'About' },
      { href: '/user', text: 'User' }
    ],
    self = {
      getTitle: function EJSHelperGetTitle(title) {
        return (title ? title + ' | ' : '') + _projectTitle;
      },
      getNavbar: function EJSHelperGetNavbar(active) {
        for (var i = 0; i < _navbarPoints.length; i++) {
          _navbarPoints[i].active = _navbarPoints[i].text === active || _navbarPoints[i].href === active ? ' class="active"' : '';
        }
        return _navbarPoints;
      },
      render: function EJSHelperRender(res, view, options) {
        res.render(view, {
          view: view,
          title: self.getTitle(options.title || null),
          navbar: self.getNavbar(options.active || null),
          user: options.user || null
        });
      }
    };
  return self;
})();

var db = (function MySQL(_conf) {
  var
    _connection,
    self = {
      getConnection: function () {
        if (!_connection) {
          _connection = require('mysql').createConnection(_conf);
        }
        return _connection;
      },
      query: function (query, callback) {
        self.getConnection();
        _connection.connect();
        _connection.query(query, callback);
        _connection.end();
      }
    };
  self.query('CREATE TABLE IF NOT EXISTS `users` (`id` INT NOT NULL AUTO_INCREMENT, `name` VARCHAR(255) NOT NULL, `pass` BLOB NOT NULL);');
  return self;
})(process.env.VCAP_SERVICES['mysql-5.1'][0] || {credentials: {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'keines'
}});

amqp.on('ready', function () {
  chatExchange = amqp.exchange('chatExchange', { type: 'fanout' });
});

// Configure socket.io
io
  .set('transports', [ 'xhr-polling' ])
  .set('log level', 1)
;

// Configure our app and set up routes.
app
  .configure(function () {
    this
      .set('port', process.env.PORT || 3000)
      .set('views', __dirname + '/views')
      .set('view engine', 'ejs')
      .use(cookieParser)
      .use(express.logger('dev'))
      .use(express.bodyParser())
      .use(express.methodOverride())
      .use(express.session({ store: sessionStore, key: 'jsessionid', secret: cookieSecret }))
      .use(express.static(path.join(__dirname, 'public')))
      .use(this.router);
  })
  .configure('development', function () {
    this.use(express.errorHandler());
  })
  .get('/', function (req, res) {
    var user;
    try {
      user = req.session.user;
      res.session.regenerate(function (error) {
        req.session.user = user;
        ejsHelper.render(res, 'index', { active: 'Home', user: user });
      });
    } catch (e) {
      res.redirect('/user');
    }
  })
  .get('/user', function (req, res) {
    if (req.session && req.session.user) {
      // @todo Render user profile page.
    } else {
      ejsHelper.render(res, 'login', { title: 'Login' });
    }
  })
  .post('/user/logout', function (req, res) {

  })
  .post('/user/register', function (req, res) {
    var _genPass = function () {
      var
        chars = '',
        length = 8,
        pass = '',
        countChars = 0,
        countNums = 0,
        rNum;
      for (var i = 0; i < length; i++) {
        if ((Math.floor(Math.random() * 2) === 0) && countNums < 3 || countChars >= 5) {
          rNum = Math.floor(Math.random() * 10);
          pass += rnum;
          countNums++;
        } else {
          rNum = Math.floor(Math.random() * chars.length);
          pass += chars.substring(rNum, rNum + 1);
          countChars++;
        }
      }
      return pass;
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write(req);
    res.end('\n');
//    require('mongodb').connect(mongodb.getUrl(), function (err, conn) {
//      conn.collection('users', function (err, coll) {
//        var user = {
//          name: req.body.name,
//          mail: req.body.mail,
//          pass: _genPass(),
//          ip: req.connection.remoteAddress,
//          date: new Date()
//        };
//        coll.insert(user, { safe: true }, function (err) {
//          res.writeHead(200, { 'content-type': 'application/json' });
//          res.write(JSON.stringify(user));
//          res.end('\n');
//        });
//      });
//    });
  })
  .post('/user/login', function (req, res) {
    ejsHelper.render(res, 'login', { title: 'Login' });
  })
;

sessionSockets.on('connection', function (error, socket, session) {
  socket.on('chat', function (data) {
    var msg = JSON.parse(data);
    chatExchange.publish('', { action: 'message', user: session.user, msg: msg.msg });
  });
  socket.on('join', function () {
    chatExchange.publish('', { action: 'control', user: session.user, msg: ' joined the channel.' });
  });
  amqp.queue('', { exclusive: true }, function (q) {
    q.bind('chatExchange', '');
    q.subscribe(function (message) {
      socket.emit('chat', JSON.stringify(message));
    });
  });
});

server.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});