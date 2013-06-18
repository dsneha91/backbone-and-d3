/**
*	A reusable time series statistical graphic with Backbone.js and D3.js
*
*
*
*	Author:
*		Kristofer Gryte
*		http://www.kgryte.com
*
*	History:
*		2013/06/12 - KGryte. Created.
*
*
*	TODO:
*		[1] Decouple view 'data' from view itself. Create a chart model (?) --> a work in progress
*		[2] Validate model data
*		[3] Parse input options for view
*		[4] Stipulate updates
*		[5] Note that xScale and yScale are polymorphic in the data layer --> this makes sense due to data binding; data allows us to calculate domains; each layer should be independent of children inheritors.
*		[6] Change axis implementation. Currently, external modification does not make sense, as axis is translated beyond user control
*		[7] 
*		[8]  
*		[9] 
*		[10] Ensure standard data representation
*		[11] Allow for ChartModel axis min and max setting (both axes) --> perform CHECKS! Use underscore.js
*		[12] Switch the order such that axes plotted on top of data (?)
*		[13] 
*		[14] Resolve the tension between the animation layer and, say, the data layer with regard to transitions. Question to answer: are transitions something fundamental to the graph (to its normal functioning)? If so, then transitions in the data layer; otherwise, something extra (gratuitus). Add/remove methods for new dataseries.
*		[15] For real-time sliding window, need to establish a one data point buffer so that the left data edge matches the chart viewport. --> Two ways: 1) create an explicit buffer; 2) fiddle with the collection updates so that the listener fires only on add but not remove. Currently, this is how the buffer is maintained. The downside is that the last time series legend lags.
*		[16] Replace underscore with lo-dash (?)
*		[17] x and y accessors? Are they necessary? Could this allow for user's to define their own input data structure? e.g., array versus associative array?
*
*	BUGS:
*		[1] On load, the animation transition is sometimes interrupted. This could be due to the transition() method being over-written. --> Yes! If a listener event is called, say, the user hovers/mousemoves over the plot, the transition is interrupted. 
*
*
*
*	 Copyright (c) 2013. Kristofer Gryte. http://www.kgryte.com
*	 License: MIT (http://www.opensource.org/licenses/mit-license.php)
*
*/



//////////////////////
// 		Models   	//
//////////////////////

// Individual data points:
var DataPoint = Backbone.Model.extend({

	// Set the default coordinates for an individual data point:
	defaults: function() {
		return {
			'x': 0, // default is two-dimensions
			'y': 0
		};
	},

	// The basic type in a time series is a point:
	type: "point"

});


// Individual data series:
var DataSeries = Backbone.NestedModel.extend( {

	// Set the default format for an individual data series:
	defaults: function() {
		return {
			'dataSeries': [] // default is an array of DataPoints
		};
	},

	// A collection of data points is of type data series:
	type: "dataSeries"

});


// Chart Model:
var ChartModel = Backbone.Model.extend({

	// Set the default chart parameters:
	defaults: {

		// Chart area specifications:
		margin: { 
			// for the graph, margin; for the canvas, this is padding
			'top': 20,
			'right': 80,
			'bottom': 50,
			'left': 80
		},
		canvas: {
			'width': 960,
			'height': 500
		},

		// Title:
		title: '',

		// Caption:
		caption: '',

		// Legend:
		legend : [], // each legend label should be a string; e.g., ['line1', 'line2', 'line3']

		// Axis labels:
		xLabel: 'x',
		yLabel: 'y',

		// Axis limits; keywords: 'min' and 'max' to auto-calculate the respective limit; leave empty to auto-calculate both limits
		xDomain: [], // xLimits
		yDomain: [0, 'max'], // yLimits

		// Line colors:
		colors: 'auto', //['g','r','k','b'], // these correspond to CSS classes; can also set to 'auto' for calculated color generation

		// Data smoothing:
		interpolation: 'linear',

		// Animation parameters:
		animation: 'arise', // options: enterLeft, arise
		animationProps: {
			'onEnter': {
				'duration': 1000,
				'easing': 'linear'
			},
			'onUpdate': {
				'duration': 1000,
				'easing': 'linear'
			},
			'onExit': {
				'duration': 1000,
				'easing': 'linear'
			}
		}, 

		// Transition parameters:
		transition: {
			'onEnter': {
				'duration': 1000,
				'easing': 'linear'
			},
			'onUpdate': {
				'duration': 1000, // this parameter should be tuned to the velocity of incoming data
				'easing': 'linear'
			},
			'onExit': {
				'duration': 1000,
				'easing': 'linear'
			}
		},

		// Plot mode: (primarily targeted toward real-time data feeds)
		mode: 'window', // options: window, add, dynamic, (others?)

		// Brush settings:
		brush: false,
		brushProps: {
			'height': 50,
			'width': 960,
			'margin': {
				'top': 10,
				'right': 20,
				'bottom': 20,
				'left': 80
			}
		},

		// Listeners:
		listeners: {
			'chart': true,
			'data': true
		}, 

		// Data cursor:
		dataCursor: false

	}

});



//////////////////////
// 	  COLLECTION  	//
//////////////////////


// A line chart is a set of data series, each a collection of data points:
var DataCollection = Backbone.Collection.extend({

	// A data series will serve as the basic unit for our collection:
	model: DataSeries

});




//////////////////////
//	  	VIEWS 		//
//////////////////////


// Create the base chart layer (the canvas):
var ChartBase = Backbone.View.extend({

	initialize: function( options ) {
		// 
	},

	render: function() {

		this.initCanvas();

		return this;

	},

	initCanvas: function() {

		// Initialize the layers object:
		this.layer = {};

		// Get the graph size:
		this.model.set( '_graph', this.graphSize() );

		// Create local variables to make the code less verbose:
		var element = this.el,
			canvas = this.model.get('canvas'),
			margin = this.model.get('margin'),
			graph = this.model.get('_graph');

		// Create an HTML <figure> container to hold the chart:
		this.layer.container = d3.select( element ).append('figure')
			.attr('width', canvas.width)
			.attr('class', 'mvcChart');
		
		// Create the canvas:
		this.layer.base = this.layer.container.append("svg:svg")
			.attr('width', canvas.width)
			.attr('height', canvas.height)
			.attr('class', 'base');

		// Initialize the chart area:
		this.layer.chart = this.layer.base.append("svg:g")
			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
			.attr('class', 'chart');

		// Append a path clipper, defining the data viewport:
		var numCharts = d3.selectAll('.mvcChart')[0].length,
			clipPathID = 'graphClipPath' + numCharts;

		this.model.set( '_clipPath', '#' + clipPathID );

		this.layer.chart.append("svg:defs")
			.append("svg:clipPath")
				.attr("id", clipPathID)
				.append("svg:rect")
					.attr("width", graph.width)
					.attr("height", graph.height);

		return this;

	},

	graphSize: function() {
		var canvas = this.model.get('canvas'),
			margin = this.model.get('margin');
		return {
			width: canvas.width - margin.left - margin.right,
			height: canvas.height - margin.top - margin.bottom
		}
	}	

});



// Create the Axes layer:
var ChartArea = ChartBase.extend({

	initialize: function( options ) {
		// This overrides any inherited initialize functions.
	},

	render: function() {

		// [1] Create the canvas, [2] Generate the axes
		this.initCanvas()
			.initAxes();

		return this;

	},

	initAxes: function() {

		// Extend the layer object:
		this.layer.axis = {};

		// Set the scales and both axis:
		this.xScale()
			.yScale()
			.xAxis()
			.yAxis();			

		// Local variables:
		var graph = this.model.get('_graph'),
			margin = this.model.get('margin'),
			xLabel = this.model.get('xLabel'),
			yLabel = this.model.get('yLabel'),
			xAxis = this.model.get('_xAxis'),
			yAxis = this.model.get('_yAxis');		

		// Create the axes:
		this.layer.axis.x = this.layer.chart.append("svg:g")
			.attr("class", "x axis")
			.attr("transform", "translate(0," + graph.height + ")")
			.call( xAxis );

		this.layer.axis.x.append("svg:text")
			.attr("y", 40)
			.attr("x", graph.width / 2)
			.attr("text-anchor", "middle")
			.attr("class", "label")
			.text( xLabel );

		this.layer.axis.y = this.layer.chart.append("svg:g")
			.attr("class", "y axis")
			.call( yAxis );

		this.layer.axis.y.append("svg:text")
			.attr("transform", "rotate(-90)")
			.attr("y", -(margin.left-6))
			.attr("dy", ".71em")
			.attr("x", -(graph.height / 2))
			.attr("text-anchor", "middle")
			.attr("class", "label")
			.text( yLabel );

		return this;
		
	},


	xScale: function( __ ) {

		var xScale;
		if (!arguments.length) {
			xScale = d3.scale.linear().nice(); // Default
		}else {
			// Allow external setting of the scale:
			xScale = __; 
		}; // end IF/ELSE

		// Get the graph width:
		var width = this.model.get('_graph').width;
		
		// Set the scale range:
		xScale.range( [0, width] );

		// Update our chart model:
		this.model.set('_xScale', xScale);

		return this;

	},

	yScale: function( __ ) {

		var yScale;
		if (!arguments.length) {
			yScale = d3.scale.linear().nice(); // Default
		}else {
			// Allow external setting of the scale:
			yScale = __; 
		}; // end IF/ELSE

		// Get the graph height:
		var height = this.model.get('_graph').height;

		// Set the scale range:
		yScale.range( [height, 0] );

		// Update our chart model:
		this.model.set('_yScale', yScale);	

		return this;	
			
	},

	xAxis: function( __ ) {

		var xAxis = d3.svg.axis()
			.scale( this.model.get('_xScale') );

		if (!arguments.length) {
			xAxis.orient('bottom'); // Default
		}else {
			// Allow external setting of the axis:
			xAxis.orient( __ );
		}

		// Update our chart model:
		this.model.set('_xAxis', xAxis);

		return this;

	},

	yAxis: function( __ ) {
		
		var yAxis = d3.svg.axis()
			.scale( this.model.get('_yScale') );

		if (!arguments.length) {
			yAxis.orient('left'); // Default
		}else {
			// Allow external setting of the axis:
			yAxis.orient( __ );
		}

		// Update our chart model:
		this.model.set('_yAxis', yAxis);

		return this;

	},

	updateAxes: function(){

		var xAxis = this.model.get('_xAxis'),
			yAxis = this.model.get('_yAxis');

		// Axes:
		this.layer.axis.x.call( xAxis );		
		this.layer.axis.y.call( yAxis );

	},

	refreshAxes: function( model, newVal ) {

		// Refresh our scales and axes:
		this.xScale()
			.yScale()
			.xAxis()
			.yAxis();

		var xAxis = this.model.get('_xAxis'),
			yAxis = this.model.get('_yAxis');	

		// Axes Labels
		this.layer.axis.x.call( xAxis )
			.selectAll('.label')
			.text( this.model.get('xLabel') );
		
		this.layer.axis.y.call( yAxis )
			.selectAll('.label')
			.text( this.model.get('yLabel') );

	}

});






// Create the line chart layer:
var DataLayer = ChartArea.extend({

	initialize: function( options ) {	
		// This overrides any inherited initialize functions.
	},

	render: function() {

		// [1] Create the canvas, [2] Initialize the data, [3] Generate the axes, [4] Bind the data, [5] Plot the data
		this.initCanvas()
			.initData()
			.initAxes() // TODO: need to switch the order. Draw the axes atop the data; order matters.
			.bindData()
			.plot();
			
		return this;

	},

	plot: function() {

		// Create the path generator:
		this.line();

		// Get the path generator:
		var line = this.model.get('_line');
		
		// Generate the lines:
		this.layer.data.paths.attr("d", function(d,i) { 
				return line( d.get('dataSeries') ); 
			} );


		if (this.model.get('colors') != 'auto') {
			// Get the color choices:
			var colorClasses = this.model.get('colors'),
				numColors = colorClasses.length;

			this.layer.data.paths.each( function(d,i) {
				// Loop back through the colors if we run out!
				var color = colorClasses[ i % numColors ];
				d3.select(this).classed( color, 1 ); 
			});

		}else {
			// Generate the colors:
			var color = d3.scale.category10();

			this.layer.data.paths.style('stroke', function(d,i) { 
				return color(i);
			});

		}; // end IF/ELSE colors

		// Initialize how the plot is updated:
		this.update();

		return this;
		
	},

	redraw: function() {
		// Get the path generator:
		var line = this.model.get('_line');
		
		this.layer.data.paths.attr('d', function(d,i) { 
			return line( d.get('dataSeries') );
		});
	},

	initData: function() {

		// Get the number of data series:
		var numSeries = this.collection.length;

		// NOTE: data is an array of arrays; we perform a shallow copy to avoid duplication; we store the copy as a convenience method
		this.data = this.collection.slice( 0, numSeries );

		// Store the number of time series:
		this.model.set('_numSeries', numSeries );

		// Calculate the x- and y-offsets:
		this.model.set( { 
			'_xOffset': this.min('x'), 
			'_yOffset': this.min('y') 
		} );

		return this;

	},

	min: function( key ) {
		return d3.min( this.data, function(d) { 
			return d3.min( d.get('dataSeries'), function(dataPt) { 
				return dataPt[ key ]; 
			}); 
		});
	},

	max: function( key ) {
		return d3.max( this.data, function(d) { 
			return d3.max( d.get('dataSeries'), function(dataPt) { 
				return dataPt[ key ]; 
			}); 
		});
	},

	bindData: function() {

		// Extend the layer object:
		this.layer.data = {};

		// Create a group for all data series:
		this.layer.data.base = this.layer.chart.append("svg:g")
				.attr("class", "data-series");

		// Include a path clipper to prevent layer spillover:
		this.layer.data.clipPath = this.layer.data.base.append("svg:g") 
			.attr("clip-path", "url(" + this.model.get( '_clipPath' ) +  ")");

		// Bind the data and initialize the path elements:
		this.layer.data.paths = this.layer.data.clipPath.selectAll(".line")
			.data( this.data ) 
		  .enter() // create the enter selection
		  	.append("svg:path")
				.attr("class", function(d,i) { 
					return "line " + "line" + i; 
				});

		return this;

	},

	line: function( __ ) {

		// Get the scales and interpolation:
		var xScale = this.model.get('_xScale'),
			yScale = this.model.get('_yScale'),
			interpolation = this.model.get('interpolation');
		
		var line = d3.svg.line();
		if (!arguments.length) {
			// Set the default:

			line
				.x( function(d) { return xScale( d.x ); } )
				.y( function(d) { return yScale( d.y ); } )
				.interpolate( interpolation );

		}else {
			// Allow external setting of the line path:
			line = __;
		}

		// Update our chart model:
		this.model.set('_line', line);

		return this;
			
	},

	xScale: function( __ ) {

		var xScale;
		if (!arguments.length) {
			xScale = d3.scale.linear(); // Default
		}else {
			// Allow external setting of the scale:
			xScale = __; 
		}; // end IF/ELSE

		// Get data from the Chart Model:
		var width = this.model.get('_graph').width,
			xDomain = [];

		// Need to perform a copy:
		for (var i = 0; i < this.model.get('xDomain').length; i++){
			xDomain[i] = this.model.get('xDomain')[i];
		}; // end FOR i

		// Update the scale domain and range:
		if (xDomain.length < 2) {
			// Calculate the domain:
			xDomain = [ this.min( 'x' ), this.max( 'x' ) ];

		} else if (xDomain[0] === 'min') {

			xDomain[0] = this.min( 'x' );

		} else if (xDomain[1] === 'max') {

			xDomain[1] = this.max( 'x' );

		}; // end IF/ELSEIF/ELSEIF

		xScale.domain( xDomain )
			.range( [0, width] );

		// Update our chart model:
		this.model.set('_xScale', xScale);
		this.model.set('_xDomain', xDomain);

		return this;

	},

	yScale: function( __ ) {

		var yScale;
		if (!arguments.length) {
			yScale = d3.scale.linear().nice(); // Default
		}else {
			// Allow external setting of the scale:
			yScale = __; 
		}; // end IF/ELSE

		// Get Chart Model data:
		var height = this.model.get('_graph').height,
			yDomain = [];

		// Need to perform a copy:
		for (var i = 0; i < this.model.get('yDomain').length; i++){
			yDomain[i] = this.model.get('yDomain')[i];
		}; // end FOR i

		// Update the scale domain and range:
		if (yDomain.length < 2) {
			// Calculate the domain:
			yDomain = [ this.min( 'y' ), this.max( 'y' ) ];

		} else if (yDomain[0] === 'min') {

			yDomain[0] = this.min( 'y' );

		} else if (yDomain[1] === 'max') {

			yDomain[1] = this.max( 'y' );

		}; // end IF/ELSEIF/ELSEIF

		yScale.domain( yDomain )
			.range( [height, 0] );

		// Update our chart model:
		this.model.set('_yScale', yScale);
		this.model.set('_yDomain', yDomain);

		return this;

	},


	update: function() {

		var updateFcn;
		switch ( this.model.get( 'mode' ) ) {

			case 'window':
				// A sliding window of constant width. Good for when we only care about recent history and having a current snapshot:

				updateFcn = this.slideWindow;
				break;

			case 'add':

				// Data is added to the path. Axes domain expands. No sliding is needed.

				break;

			case 'dynamic':

				// Data is changed in place. Meaning the path and axes may update, but we do not need to transform the path. 

				break;

			default:
				console.log('WARNING:unrecognized transition.');
				break;

		}; // end SWITCH mode

		this.model.set('_updateFcn', updateFcn);

		return this;

	},


	slideWindow: function( model, updatedData ) {

		// Redraw the paths and reset the translation:
		var line = this.model.get('_line');
		this.layer.data.paths.attr('d', function(d) {
				return line( d.get('dataSeries') );
			})
			.attr('transform', null);

		// Reset yDomain to original preference; if originally specified, calculate new max and min:
		this.yScale();

		// 
		var xScale = this.model.get('_xScale'),
			xOffset = this.model.get('_xOffset'),
			props = this.model.get('transition').onUpdate;

		// Update the x domain:
		var xMin = this.data[0].get('dataSeries')[1].x, // We assume a sorted data set
			xMax = _.last( this.data[0].get('dataSeries') ).x,
			xDomain = [ xMin, xMax ],
			xOffset = xDomain[0];
		
		xScale.domain( xDomain );

		this.model.set( {
			'_xDomain': xDomain
		});
		
		// Transition the axes:
		this.layer.axis.x.transition()
			.duration( props.duration ) 
			.ease( props.easing )
			.call( this.model.get('_xAxis') );
		
		this.layer.axis.y.transition()
			.duration( props.duration )
			.ease( props.easing )
			.call( this.model.get('_yAxis') );					

		// Calculate the shift:
		var lastVals = _.last( this.data[0].get('dataSeries'), 2 ),
			shift = xOffset - (lastVals[1].x - lastVals[0].x);

		// Slide the path with a transition:
		this.layer.data.paths.transition()
			.duration( props.duration )
			.ease( props.easing )
			.attr('transform', 'translate(' + xScale( shift ) + ')');

		return this;

	}

}); // end DataLayer



// Annotation Layer:
var AnnotationLayer = DataLayer.extend({

	initialize: function() {
		// This overrides any inherited initialize methods.
	},

	render: function() {

		this.initCanvas()		// Create the canvas layer
			.initData()			// Initialize the data
			.initAxes()			// Create the axes layer
			.bindData()			// Bind the data and initialize the paths layer
			.plot()				// Plot the data
			.annotate(); 		// Bind the annotations to the chart
			
	},

	annotate: function() {

		// Initialize the annotation layer:
		this.layer.annotation = {};

		// Parse the relevant settings:
		var title = this.model.get('title'),
			caption = this.model.get('caption'),
			legend = this.model.get('legend'),
			dataCursor = this.model.get('dataCursor');

		if ( title ) {
			this.title();
		}; // end IF title

		if ( caption ) {
			this.caption();
		}; // end IF caption

		if ( legend.length ) {
			// Check!:
			if (legend.length != this.data.length) {
				// Gracefully not output anything and issue a warning to the console:
				console.log('WARNING:number of legend labels does not equal the number of data series. Legend not generated.');
			}else  {
				this.legend();
			}; // end IF/ELSE
		}; // end IF legend

		if ( dataCursor ) {
			this.initCursor();
		}; // end IF dataCursor

		return this;

	},

	title: function() {
		this.layer.annotation.title = this.layer.chart.append('svg:text')
			.attr('x', this.model.get('_graph').width / 2)
			.attr('y', 2 )
			.attr('text-anchor', 'middle')
			.attr('class', 'title')
			.text( this.model.get('title') );

		return this;
	},

	caption: function() {
		// For the caption, we append a <figcaption> to the <figure> container:
		this.layer.annotation.caption = this.layer.container.append('figcaption')
			.attr('class', 'caption')
			.style('width',  this.model.get('_graph').width + 'px' )
			.style('padding-left', this.model.get('margin').left + 'px' )
			.html( this.model.get('caption') );

		return this;
	},

	legend: function() {
		// Initialize the legend layer:
		this.layer.annotation.legend = [];

		// For each data series, get the last data value and append a text object to that value:
		var data = [],
			legend = this.model.get('legend'),
			xScale = this.model.get('_xScale'),
			yScale = this.model.get('_yScale');

		_.each(this.data, function(d,i) {
			data.push( _.last( d.get('dataSeries') ) );
		});			

		this.layer.annotation.legend = this.layer.chart.selectAll('.legend')
			.data( data )
		  .enter().append('svg:text')
			.attr('transform', function(d) { return "translate(" + xScale(d.x) + "," + yScale(d.y) + ")"; })
			.attr('x', 3 )
			.attr('dy', ".35em" )
			.attr('class', 'legend')
			.text( function(d,i) { return legend[i]; } );		

		return this;
	},

	updateLegend: function() {
		// Get the current xDomain and x- and y-scales:
		var xDomain = this.model.get('_xScale').domain(),
			xScale = this.model.get('_xScale'),
			yScale = this.model.get('_yScale');

		// Define the x-bisector: (where, for the id returned, data[id-1] < val < data[id])
		var xBisect = d3.bisector( function(d) { return d.x; }).left;

		var data = [],
			id;
		_.each(this.data, function(d,i) {
			id = xBisect( d.get('dataSeries'), xDomain[1] );
			if (id >= d.get('dataSeries').length) {
				id = id - 1; // edge case
			}; // end IF
			data.push( {
				'x': xDomain[1],
				'y': d.get('dataSeries')[id].y
			});
		});

		this.layer.annotation.legend
			.data( data )
			.transition()
				.duration(100)
				.ease('linear')
				.attr('transform', function(d) { 
					return 'translate(' + xScale(d.x) + ',' + yScale(d.y) + ')'; });

		return this;

	},

	initCursor: function() {

		// Get the base data layer:
		var layer = this.layer.data.base;

		// Add the tooltip to our annotation layer:
		var tooltip = this.layer.container.append('div')
			.attr('class', 'data-cursor tooltip')
			.style('opacity', 0);

		// Namespace the data cursor callback:
		this.layer.data.paths.on('mouseover.cursor', createCursor )
			.on('mouseout.cursor', destroyCursor );

		// Get the x- and y-scales:
		var xScale = this.model.get('_xScale'),
			yScale = this.model.get('_yScale');

		// Define the x-bisector: (where, for the id returned, data[id-1] < val < data[id])
		var xBisect = d3.bisector( function(d) { return d.x; }).left;

		// Initialize the mouse coordinates:
		var coords;

		return this;

		function createCursor() {

			// Get the current mouse coordinates:
			coords = d3.mouse( this );

			// Map those pixel coordinates to the data space:
			var xData = xScale.invert( coords[0] ),
				yData = yScale.invert( coords[1] );

			// Determine the closest data indices:
			var data = d3.select(this).data()[0].get('dataSeries'),
				xPos = xBisect(data, xData);

			if ( (xData-data[xPos-1].x) < (data[xPos].x-xData) ) {
				// The closet x-value is the previous data point:
				xPos = xPos - 1;
			}; // end IF			

			layer.selectAll('.data-cursor')
				.data( [ data[xPos] ] )
			  .enter().append('svg:circle')
			  	.attr('class', 'data-cursor')
			  	.attr('cx', function(d) { return xScale(d.x); } )
			  	.attr('cy', function(d) { return yScale(d.y); } )
			  	.attr('fill', 'black')
			  	.attr('r', 0)
			  	.transition()
			  		.duration(500)
			  		.ease('linear')
			  		.attr('r', 5)
			  		.call( showTooltip, data[xPos] );


		}; // end FUNCTION createCursor()

		function destroyCursor() {
			d3.selectAll('.data-cursor')
				.transition()
					.call( hideTooltip )
					.duration(200)
					.ease('linear')
					.attr('r', 0)
					.remove();
		}; // end FUNCTION destroyCursor()

		function showTooltip( transition, d ) {
			var str = 'x: ' + d.x + '<br>y: ' + d.y;
			tooltip.transition()
				.duration(200)
				.style('opacity', 0.9);
			tooltip.html( str )
				.style('left', d3.event.pageX + 8 + 'px')
				.style('top', d3.event.pageY + 'px');
		}; // end FUNCTION showTooltip()

		function hideTooltip( d ) {
			tooltip.transition()
				.duration(200)
				.style('opacity', 0);
		}; // end FUNCTION hideTooltip()

	}

}); // end AnnotationLayer



// Listener Layer:
var ListenerLayer = AnnotationLayer.extend({

	render: function() {

		this.initCanvas()		// Create the canvas layer
			.initData()			// Initialize the data
			.initAxes()			// Create the axes layer
			.bindData()			// Bind the data and initialize the paths layer
			.plot()				// Plot the data
			.annotate() 		// Bind the annotations to the chart
			.listen(); 			// Bind listeners so that views update upon model changes

	},

	listen: function() {

		// Get listeners settings:
		var settings = this.model.get('listeners');

		if ( settings.chart ) {

			// Bind chart data listeners:
			this.model.on('change:xLabel change:yLabel', this.refreshAxes, this);
			this.model.on('change:_xDomain change:_yDomain', this.updateAxes, this);
			this.model.on('change:_xDomain change:_yDomain', this.redraw, this);
			this.model.on('change:_xDomain change:_yDomain', this.updateLegend, this);

		}; // end IF

		if ( settings.data ) {

			// Bind plot data listeners:

			var updateFcn = this.model.get('_updateFcn');

			//this.collection.on('add:dataSeries', this.update, this);
			this.collection.on('change:dataSeries', updateFcn, this);
			//this.collection.on('reset', this.update, this);

		}; // end IF

	}

});



// Interaction layer:
var InteractionLayer = ListenerLayer.extend({

	initialize: function( options ) {
		// This overrides any inherited initialize functions.
	},

	render: function() {

		this.initCanvas()		// Create the canvas layer
			.initData()			// Initialize the data
			.initAxes()			// Create the axes layer
			.bindData()			// Bind the data and initialize the paths layer
			.plot()				// Plot the data
			.annotate() 		// Bind the annotations to the chart
			.bindInteration()	// Bind the interaction behavior
			.listen(); 			// Bind listeners so that views update upon model changes

	},

	bindInteraction: function() {

		var selection = this.layer.data.paths;

		// Initialize our hover events:
		this.mouseover().mouseout();

		// Get the events:
		var mouseover = this.model.get('_mouseover'),
			mouseout = this.model.get('_mouseout');

		// Set the hover events:
		selection
			.style('cursor', 'pointer')
			.on('mouseover.hover', mouseover )
			.on('mouseout.hover', mouseout );

		// Determine if brush interaction is enabled:
		if ( this.model.get('brush') ) {
			this.initBrush()
				.createBrush();
		}; // end IF brush.on

		return this;

	},

	mouseover: function() {

		var mouseover = function() {
			var self = this;
			d3.selectAll('.data-series .line')
				.transition()
				.filter( function(d) {
					return self != this;
				})
				.duration(1000)
				.style('opacity', 0.3);
		};

		// Update our chart model:
		this.model.set('_mouseover', mouseover);

		return this;

	},

	mouseout: function() {

		var mouseout = function() {
			d3.selectAll('.data-series .line')
				.transition()
				.duration(200)
				.style('opacity', 1);
		};

		// Update our chart model:
		this.model.set('_mouseout', mouseout);

		return this;

	},

	initBrush: function() {

		// The brush is essentially its own mini chart.

		// Get the brush properties:
		var props = this.model.get('brushProps'),
			width = this.model.get('_graph').width; // this is a hack; need to allow for setting.

		// Get the xScale:
		var xScale = this.model.get('_xScale');

		// Specify the brush scale:
		var brushScale = d3.scale.linear()
			.domain( xScale.domain() ) // same domain as our main chart
			.range( [ 0, width ] ); // HACK!

		// Specify the brush axis generator:
		var brushAxis = d3.svg.axis()
			.scale( brushScale )
			.tickSize( props.height )
			.tickPadding( -props.height/2 )
			.orient('bottom');

		// Specify the brush generator:
		var brush = d3.svg.brush()
			.x( brushScale )
			.on('brush', onBrush );

		// Update our chart model:
		this.model.set( {
			'_brush': brush,
			'_brushScale': brushScale,
			'_brushAxis': brushAxis 
		} );

		var that = this;
		function onBrush() {
			// Get the current brush extent:
			var extent = brush.empty() ? brushScale.domain() : brush.extent();

			// Update the xScale:
			xScale.domain( extent );
			
			// Update our chart model: (this will trigger a listener callback)
			that.model.set('_xDomain', extent);

		}; // end FUNCTION onBrush()

		return this;

	},

	createBrush: function() {

		// Initialize the brush layer:
		this.layer.brush = {};
		this.layer.brush.axis = {};

		// Get the graph and brush specs:
		var canvas = this.model.get('canvas'),
			margin = this.model.get('margin'),
			graph = this.model.get('_graph'),
			props = this.model.get('brushProps');

		// Expand the SVG canvas: (make room for the brush)
		this.layer.base.attr('height', canvas.height + props.margin.top + props.height + props.margin.bottom);

		// Get the brush generators:
		var brush = this.model.get('_brush'),
			brushAxis = this.model.get('_brushAxis');

		// Create the brush container:
		var fromTop = canvas.height + props.margin.top;
		this.layer.brush.chart = this.layer.base.append('svg:g')
			.attr('class', 'brush')
			.attr('transform', 'translate(' + props.margin.left + ',' + fromTop + ')' );

		// Create the brush graph:
		this.layer.brush.bars = this.layer.brush.chart.append('svg:g')
			.attr('class', 'x bars')
			.call( brush )
			.selectAll( 'rect' )
			.attr('y', 0)
			.attr('height', props.height );

		// Create the brush x-axis:
		this.layer.brush.axis.x = this.layer.brush.chart.append('svg:g')
			.attr('class', 'x axis')
			.attr('transform', 'translate(0,' + 0 + ')')
			.call( brushAxis );

		return this;

	}

});




// Animation layer:
var AnimationLayer = InteractionLayer.extend({

	initialize: function( options ) {
		// This overrides any inherited initialize functions.
	},

	render: function() {

		this.initCanvas()					// Create the canvas layer
			.initData()						// Initialize the data
			.initAxes()						// Create the axes layer
			.bindData()						// Bind the data and initialize the paths layer
			.bindAnimation( )				// Setup the selection for transitions
			.plot()							// Plot the data
			.annotate() 					// Bind the annotations to the chart
			.bindInteraction()				// Bind the interaction behavior
			.animate( )						// Run the animations
			.listen(); 						// Bind listeners so that views update upon model changes

	},

	bindAnimation: function( ) {

		var selection, animationFcn;
		switch (this.model.get('animation')) {

			case 'enterLeft':

				// Define what is going to animate:
				selection = this.layer.data.paths;

				// Get the x scale and domain:
				var xScale = this.model.get('_xScale'),
					xDomain = xScale.domain();

				// Setup the transition:
				selection.attr("transform", "translate(" + xScale( -xDomain[1] ) + ")");

				// Set the animation function:
				animationFcn = enterLeft;

				break;

			case 'arise':

				// Define what is going to animate:
				selection = this.layer.data.paths;

				// Get the base layer height:
				var height = this.model.get('canvas').height;

				// Setup the transition:
				selection.attr('transform', 'translate(0,' + height + ') scale(1,0)' );

				// Set the animation function:
				animationFcn = arise;

				break;

			default:

				break;

		}; // end SWITCH animation

		// Store the selection to be animated and its associated animation:
		this.model.set({
			"_selection": selection,
			"_animationFcn": animationFcn
		});		

		return this;

		function enterLeft() {

			this.attr('transform', 'translate(' + xScale( xDomain[0] ) + ')');

		}; // end FUNCTION enterLeft()

		function arise() {

			this.attr('transform', 'translate(0,0) scale(1,1)');

		}; // end FUNCTION arise()

	},

	animate: function( ) {

		// Get the selection to be animated:
		var selection = this.model.get('_selection');

		// Get the scales:
		var xScale = this.model.get('_xScale'),
			yScale = this.model.get('_yScale');

		var props = this.model.get('animationProps'),
			duration = props.onEnter.duration,
			easing = props.onEnter.easing;

		var animate = this.model.get('_animationFcn');
		
		selection.transition()
			.duration( duration )
			.ease( easing )
			.call( animate );

		return this;

	},

	onEnter: function( __ ) {

		var onEnter;
		if (!arguments.length) {
			// TBD
		}else {
			// Allow external setting of the transition onEnter:
			onEnter = __;
		}; // end IF/ELSE

		// Update our chart model:
		this.model.set('_onEnter', onEnter);

		return this;

	},

	onUpdate: function( __ ) {

		var onUpdate;
		if (!arguments.length) {		
			// TBD
		} else {
			// Allow external setting of the transition onUpdate:
			onUpdate = __;
		}; // end IF/ELSE

		// Update our chart model:
		this.model.set('_onUpdate', onUpdate);

		return this;

	},

	onExit: function() {
		
		// TBD

		return this;

	}

});






