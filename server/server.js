var express = require('express'),
	fs = require('fs'),
	path = require('path'),
	access_logfile = fs.createWriteStream('./access.log', {flags: 'a'});
	

var app = express(),
	data = {},
	srcDir = path.join('..', 'src'), 
	partialExt = '.html',
	partialsCache = {},

	walk = function(dir, done) {
		var results = [];
		fs.readdir(dir, function(err, list) {
			if (err) return done(err);
			var i = 0;
			(function next() {
				var file = list[i++];
				if (!file) return done(null, results);
				file = path.join(dir, file);
				fs.stat(file, function(err, stat) {
					if (stat && stat.isDirectory()) {
						walk(file, function(err, res) {
							results = results.concat(res);
							next();
						});
					} else {
						results.push(file);
						next();
					}
				});
			})();
		});
	},

	isPartial = function(url) {
		return url.indexOf(partialExt) > -1;
	};

var registerServices = function(app) {
	walk('services', function(err, files) {
		for(var i = 0, max = files.length; i < max; i++) {
			var service = require('./'+files[i]);
			if (service.init) {
				console.log('Registering service: ' + path.basename(files[i], '.js'));
				service.init(app);
			}
		}
			
	});
};

var refreshPartials = function(callback) {
	walk(srcDir, function(err, files) {
		for(var i = 0; i < files.length; i++) {
			var partialPath = files[i];
			if (isPartial(partialPath)) {
				var mtime = fs.statSync(partialPath).mtime,
					currentPartial = partialsCache[partialPath];

				if (!currentPartial || currentPartial.mtime < mtime) {
					var partial = fs.readFileSync(partialPath);
					partialsCache[partialPath] = {
						content: renderTemplates(partial.toString()),
						mtime: mtime
					}
					console.log('Refreshing ' + partialPath);				
				}
			}
		}
		
		if (callback)
			callback();
	});
};

var includeRegExp = new RegExp("<%include([^>]+)%>", "gim");
var templateRegExp = new RegExp("<%template([^>]+)%>", "gim");

var getAttr = function(attr, content) {
	var regExp = new RegExp(attr + '="([0-9a-zA-Z\/_.-]+)"');
	var attrMatch = content.match(regExp);
	if (!attrMatch)
		return null;
	
	return attrMatch[1];					
}

var renderTemplates = function(html) {
	return html.replace(templateRegExp, function(all, content) {
		var id = getAttr('id', content),
			src = getAttr('src', content);
		
		return '<script id="' + id + '" type="text/ng-template"><%include src="' + src + '"%></script>'  
	});		
}

var includeFile = function(dir, html) {
	
	var matches = html.match(includeRegExp);

	if (!matches)
		return html;
		
	for(var i = 0, max = matches.length; i < max; i++) {
		var src = getAttr('src', matches[i]),
			partialPath = path.join(dir, src),
			partial = partialsCache[partialPath];
		
		if (typeof partial !== "undefined") {			
			var partialContent = includeFile(path.dirname(partialPath), partial.content);
			html = html.replace(matches[i], partialContent);
		} else {
			console.log('Partial not found:' + partialPath);
		}
	}

	return html;
}


app.set('views', srcDir);
app.engine('html', function(viewPath, options, fn) {
	refreshPartials(function() {
		var viewHtml = partialsCache[viewPath].content;
		fn(null, includeFile(path.dirname(viewPath), viewHtml));
	});
});
app.use(function(req, res, next) {
	if (isPartial(req.path)) 
		return refreshPartials(next);	
	next();
});
app.use(function(req, res, next) {
	if (!isPartial(req.path))
		return next();
	
	var partialPath = path.join(srcDir, req.path);
		partial = partialsCache[partialPath];
	if (!partial)
		return next();

	var html = includeFile(path.dirname(partialPath), partial.content);
	res.send(html);
});
app.use(express.static(path.join(__dirname, srcDir), {maxAge: 0, index: '-'}));
app.use(express.bodyParser());
app.use(express.logger({stream: access_logfile }));

registerServices(app);
refreshPartials();

var port = parseInt(process.argv[2]) || 8000;
app.listen(port);
console.log('Listening on port: ' + port);