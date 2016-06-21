#!/usr/bin/env nodejs
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const MongoClient = require('mongodb').MongoClient;
const GeoJSON = require('mongoose-geojson-schema');
const mongoose = require('mongoose');
const Promise = require('bluebird');
mongoose.Promise = Promise;// Use bluebird
const version = require('mongoose-version');
const MONGO_URL = 'mongodb://localhost:27017/virtualcache';

//SETUP CODE
app.use('/', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());

//DB setup
const db = mongoose.connection;
const locationSchema = mongoose.Schema({
	type:'Point',
	coordinates:[Number]
});
const deviceSchema = mongoose.Schema({
	name: String,
	cache:[{name:String, size:Number}],
	d2d:0,
	time:Number,
	loc: {
		type: [Number],	// [<longitude>, <latitude>]
		index: '2d'			// create the geospatial index
	}
});
deviceSchema.plugin(version);
deviceSchema.set('collection', 'devices')
const Device = mongoose.model('Device', deviceSchema);
//DB start
mongoose.connect(MONGO_URL);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
	// we're connected!
	console.log('MongoDB connected');
});

var virtual_cache;
MongoClient.connect(MONGO_URL, (err, database) => {
	if(err) throw err;
	virtual_cache = database;
	//Server Startup

	app.listen(process.env.PORT || 3000,'0.0.0.0',() => {
		console.log(`Example app listening on port ${process.env.PORT || 3000}!`);
	});
});
//ROUTES

app.get('/', function (req, res) {
	const currentDB_P = Device.find().exec();
	const history_P = virtual_cache
	.collection('versions')
	.find()
	.toArray()
	.then(data => JSON.stringify(data,null,4));
	Promise.all([currentDB_P, history_P])
	.then(arr => res.render('index',{dbCurrent:arr[0], dbHistory:arr[1]}));
});

//Json version of logs
app.post('/logs', (req, res) => {
	const query = {'name':req.body.name};
	Device.findOne(query,(err,result) => {
		console.log(req.body);
		if(result == null) {
			const device = new Device(req.body);
			device.save()
			.then(doc => res.send(`created new ${doc.name}`))
			.catch(err => console.error(err));
		} else {
			Object.assign(result, req.body);
			result.save()
			.then(doc => res.send(`updated ${doc.name}`))
			.catch(err => console.error(err));
		}
	});
});

//GeoNear features
app.post('/locsearch', (req,res) => {
	// [long, lat]
	console.log('locsearch', req.body);
	const center =	req.body.center || [0,0];
	const radiusRad = req.body.radius/6731 || 8/6731;
	console.log(center, radiusRad);
	// find a location
	Device.find({
		loc: {
			$near: center,
			$maxDistance: radiusRad
		}
	}).limit(10).exec(function(err, locations) {
		if (err) {
			return res.status(500).send(err);
		}
		res.status(201).send(locations);
	});
});

//erase DB contents
app.get('/erase', (req,res) => {
	db.collection('versions').drop();
	db.collection('devices').drop();
	res.end();
});
