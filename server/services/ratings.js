var jst = require('jstrueskill'),
	q = require('q');

var defaultGameInfo = new jst.GameInfo.getDefaultGameInfo(),
	defaultRating = defaultGameInfo.getDefaultRating(),

	simpleStrategy = function(playerId) {
		var player = new jst.Player(playerId);
		
		return {
			attacker: player,
			defender: player
		};
	},

	attackerDefenderStrategy = function(playerId) {
		var attackerId = 'attacker:' + playerId,
			defenderId = 'defender:' + playerId, 
			attacker = new jst.Player(attackerId),
			defender = new jst.Player(defenderId);
		
		return {
			attacker: attacker,
			defender: defender
		};
	},

	calculate = function(playersCollection, gamesCollection, strategy, threshold, callback) {
		var findGames = q.denodeify(gamesCollection.find().toArray),
			findPlayers = q.denodeify(playersCollection.find().sort({'name': 1}).toArray);

		findGames().then(function(games){
			return findPlayers().then(function(players){

				var attackerMap = {},
					defenderMap = {},
					playerRatingMap = {};

				for (var playerIndex in players) {
					var playerId = players[playerIndex]._id,
						player = strategy(playerId);
					attackerMap[playerId] = player.attacker;
					defenderMap[playerId] = player.defender;
					playerRatingMap[player.attacker] = playerRatingMap[player.defender] = defaultRating;
				}

				for (var gameIndex in games) {
					var game = games[gameIndex],
						blueTeam = new jst.Team("blueTeam"),
						whiteTeam = new jst.Team("whiteTeam"),
						scoreDiff = game.score.blue - game.score.white,
						rankArray = scoreDiff > threshold ? [1, 2] : scoreDiff < -threshold ? [2, 1] : [1, 1];

					for (var position in game.table) {
						var currentPlayer = (position == 'A' || position == 'D') 
							? defenderMap[game.table[position]]
							: attackerMap[game.table[position]];

						(position == 'A' || position == 'B')
							? whiteTeam.addPlayer(currentPlayer, playerRatingMap[currentPlayer])
							: blueTeam.addPlayer(currentPlayer, playerRatingMap[currentPlayer]);
					}

					var resultMap = new jst.FactorGraphTrueSkillCalculator().calculateNewRatings(defaultGameInfo,
						[blueTeam,whiteTeam], rankArray);

					for (var resultKey in resultMap) {
						if (resultMap.hasOwnProperty(resultKey)) {
							playerRatingMap[resultKey] = resultMap[resultKey];
						}
					}
				}

				function prepareRatingMap(playerMap) {
					var idToRatingMap = {};
					for (var playerId in playerMap) {
						if (playerMap.hasOwnProperty(playerId)) {
							var currentRating =  playerRatingMap[playerMap[playerId]];
							idToRatingMap[playerId] = { mean : currentRating.getMean(), sd : currentRating.getStandardDeviation()};
						}
					}
					return idToRatingMap;
				}

				return {
					attackers: prepareRatingMap(attackerMap), 
					defenders: prepareRatingMap(defenderMap)
				};
			});
		}).then(function(ratingMaps){
			callback && callback(ratingMaps);
		}).done();
	};

exports.calculate = function(db, playersCollection, gamesCollection, callback) {
	db.collection('players_ratings').drop();
	calculate(playersCollection, gamesCollection, simpleStrategy, 0, function(ratingMaps) {
		db.collection('players_ratings').insert(ratingMaps.attackers, callback);
	});
}

exports.find = function(db, playersCollection, callback) {
	playersCollection.find().sort({'name': 1}).toArray(function(err, players) {
		db.collection('players_ratings').find().toArray(function(err, ratingsArray) {
			var idToRatingMap = ratingsArray[0];
			for (var playerIndex in players) {
				var playerId = players[playerIndex]._id;
				if (!(playerId  in idToRatingMap )) {
					idToRatingMap[playerId] = { mean : defaultRating.getMean(), sd : defaultRating.getStandardDeviation()};
				}
			}
			callback && callback(idToRatingMap);
		});
	});
}

