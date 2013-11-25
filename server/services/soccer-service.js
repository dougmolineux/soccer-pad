var MongoClient = require('mongodb').MongoClient;
var PlayersStats = require('./players-stats');
var Players = require('./players');
var myDb;

var connect = function() {
	MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {

      if(err) { 
      	console.log(err);
      	return;	
      };
      myDb = db;
      var players = myDb.collection('test_players');
      var games = myDb.collection('test_games');
      PlayersStats.calculate(myDb, function(err) {
      	if (err) {
      		console.log(err);
      		return;
      	}
      	console.log('Players aggregates regenerated ... ');
      });
    });  
}

connect();

exports.init = function(server) {

	server.get('/api/players', function(req, res){
		Players.find(myDb, function(players) {
			res.send(players)
		});
	});
	
	server.get('/api/games', function(req, res){
		var collection = myDb.collection('test_games');
		collection.find().toArray(function(err, results) {
			res.send(results);
		});
	});

	server.post('/api/players/add', function(req, res) {
		var data = req.body; 
		var collection = myDb.collection('test_players'),
			lcName = data.name.toLowerCase();
		
		collection.update(
			{uid: lcName}, 
			{ $set: {
				name: data.name,
				uid: lcName
			} }, 
			{upsert: true, safe: true},
			function() {
				Players.find(myDb, function(players) {
					res.send(players)
				});
			}
		);
		

	});

	server.post('/api/games/add', function(req, res) {
		var game = req.body; 
		game.date = new Date();
		var collection = myDb.collection('test_games');
		console.log(game);
		collection.insert(game, 
			{safe: true},
			function() {
				PlayersStats.calculate(myDb, function(err) {
					if (err)
						console.log(err);

					console.log('Players aggregates regenerated ... ');
					Players.find(myDb, function(players) {
						res.send(players)
					});
				});
			}
		);	

	});
}

