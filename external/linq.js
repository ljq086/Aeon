﻿/*--------------------------------------------------------------------------
* linq.js - LINQ for JavaScript
* ver 2.2.0.2 (Jan. 21th, 2011)
*
* created and maintained by neuecc <ils@neue.cc>
* licensed under Microsoft Public License(Ms-PL)
* http://neue.cc/
* http://linqjs.codeplex.com/
*--------------------------------------------------------------------------*/

Enumerable = (function ()
{
	var Enumerable = function (getEnumerator)
	{
		this.getEnumerator = getEnumerator;
	};

	// Generator

	Enumerable.choice = function () // variable argument
	{
		var args = (arguments[0] instanceof Array) ? arguments[0] : arguments;

		return new Enumerable(function ()
		{
			return new IEnumerator(
				Functions.Blank,
				function ()
				{
					return this.yield(args[Math.floor(Math.random() * args.length)]);
				},
				Functions.Blank);
		});
	};

	Enumerable.cycle = function () // variable argument
	{
		var args = (arguments[0] instanceof Array) ? arguments[0] : arguments;

		return new Enumerable(function ()
		{
			var index = 0;
			return new IEnumerator(
				Functions.Blank,
				function ()
				{
					if (index >= args.length) index = 0;
					return this.yield(args[index++]);
				},
				Functions.Blank);
		});
	};

	Enumerable.empty = function ()
	{
		return new Enumerable(function ()
		{
			return new IEnumerator(
				Functions.Blank,
				function () { return false; },
				Functions.Blank);
		});
	};

	Enumerable.from = function (obj)
	{
		if (obj == null)
		{
			return Enumerable.empty();
		}
		if (obj instanceof Enumerable)
		{
			return obj;
		}
		if (typeof obj == Types.Number || typeof obj == Types.Boolean)
		{
			return Enumerable.repeat(obj, 1);
		}
		if (typeof obj == Types.String)
		{
			return new Enumerable(function ()
			{
				var index = 0;
				return new IEnumerator(
					Functions.Blank,
					function ()
					{
						return (index < obj.length) ? this.yield(obj.charAt(index++)) : false;
					},
					Functions.Blank);
			});
		}
		if (typeof obj != Types.Function)
		{
			// array or array like object
			if (typeof obj.length == Types.Number)
			{
				return new ArrayEnumerable(obj);
			}

			// JScript's IEnumerable
			if (!(obj instanceof Object) && Utils.isIEnumerable(obj))
			{
				return new Enumerable(function ()
				{
					var isFirst = true;
					var enumerator;
					return new IEnumerator(
						function () { enumerator = new Enumerator(obj); },
						function ()
						{
							if (isFirst) isFirst = false;
							else enumerator.moveNext();

							return (enumerator.atEnd()) ? false : this.yield(enumerator.item());
						},
						Functions.Blank);
				});
			}
		}

		// case function/object : Create KeyValuePair[]
		return new Enumerable(function ()
		{
			var array = [];
			var index = 0;

			return new IEnumerator(
				function ()
				{
					for (var key in obj)
					{
						if (!(obj[key] instanceof Function))
						{
							array.push({ key: key, value: obj[key] });
						}
					}
				},
				function ()
				{
					return (index < array.length)
						? this.yield(array[index++])
						: false;
				},
				Functions.Blank);
		});
	};

	Enumerable.return$ = function (element)
	{
		return Enumerable.repeat(element, 1);
	};

	// Overload:function(input, pattern)
	// Overload:function(input, pattern, flags)
	Enumerable.matches = function (input, pattern, flags)
	{
		if (flags == null) flags = "";
		if (pattern instanceof RegExp)
		{
			flags += (pattern.ignoreCase) ? "i" : "";
			flags += (pattern.multiline) ? "m" : "";
			pattern = pattern.source;
		}
		if (flags.indexOf("g") === -1) flags += "g";

		return new Enumerable(function ()
		{
			var regex;
			return new IEnumerator(
				function () { regex = new RegExp(pattern, flags) },
				function ()
				{
					var match = regex.exec(input);
					return (match) ? this.yield(match) : false;
				},
				Functions.Blank);
		});
	};

	// Overload:function(start, count)
	// Overload:function(start, count, step)
	Enumerable.range = function (start, count, step)
	{
		if (step == null) step = 1;
		return Enumerable.toInfinity(start, step).take(count);
	};

	// Overload:function(start, count)
	// Overload:function(start, count, step)
	Enumerable.rangeDown = function (start, count, step)
	{
		if (step == null) step = 1;
		return Enumerable.toNegativeInfinity(start, step).take(count);
	};

	// Overload:function(start, to)
	// Overload:function(start, to, step)
	Enumerable.rangeTo = function (start, to, step)
	{
		if (step == null) step = 1;
		return (start < to)
			? Enumerable.toInfinity(start, step).takeWhile(function (i) { return i <= to; })
			: Enumerable.toNegativeInfinity(start, step).takeWhile(function (i) { return i >= to; })
	};

	// Overload:function(obj)
	// Overload:function(obj, num)
	Enumerable.repeat = function (obj, num)
	{
		if (num != null) return Enumerable.repeat(obj).take(num);

		return new Enumerable(function ()
		{
			return new IEnumerator(
				Functions.Blank,
				function () { return this.yield(obj); },
				Functions.Blank);
		});
	};

	Enumerable.repeatWithFinalize = function (initializer, finalizer)
	{
		initializer = Utils.createLambda(initializer);
		finalizer = Utils.createLambda(finalizer);

		return new Enumerable(function ()
		{
			var element;
			return new IEnumerator(
				function () { element = initializer(); },
				function () { return this.yield(element); },
				function ()
				{
					if (element != null)
					{
						finalizer(element);
						element = null;
					}
				});
		});
	};

	// Overload:function(func)
	// Overload:function(func, count)
	Enumerable.generate = function (func, count)
	{
		if (count != null) return Enumerable.generate(func).take(count);
		func = Utils.createLambda(func);

		return new Enumerable(function ()
		{
			return new IEnumerator(
				Functions.Blank,
				function () { return this.yield(func()); },
				Functions.Blank);
		});
	};

	// Overload:function()
	// Overload:function(start)
	// Overload:function(start, step)
	Enumerable.toInfinity = function (start, step)
	{
		if (start == null) start = 0;
		if (step == null) step = 1;

		return new Enumerable(function ()
		{
			var value;
			return new IEnumerator(
				function () { value = start - step },
				function () { return this.yield(value += step); },
				Functions.Blank);
		});
	};

	// Overload:function()
	// Overload:function(start)
	// Overload:function(start, step)
	Enumerable.toNegativeInfinity = function (start, step)
	{
		if (start == null) start = 0;
		if (step == null) step = 1;

		return new Enumerable(function ()
		{
			var value;
			return new IEnumerator(
				function () { value = start + step },
				function () { return this.yield(value -= step); },
				Functions.Blank);
		});
	};

	Enumerable.unfold = function (seed, func)
	{
		func = Utils.createLambda(func);

		return new Enumerable(function ()
		{
			var isFirst = true;
			var value;
			return new IEnumerator(
				Functions.Blank,
				function ()
				{
					if (isFirst)
					{
						isFirst = false;
						value = seed;
						return this.yield(value);
					}
					value = func(value);
					return this.yield(value);
				},
				Functions.Blank);
		});
	};

	// Extension Methods

	Enumerable.prototype =
	{
		/* Projection and Filtering Methods */

		// Overload:function(func)
		// Overload:function(func, resultSelector<element>)
		// Overload:function(func, resultSelector<element, nestLevel>)
		cascadeBreadthFirst: function (func, resultSelector)
		{
			var source = this;
			func = Utils.createLambda(func);
			resultSelector = Utils.createLambda(resultSelector);

			return new Enumerable(function ()
			{
				var enumerator;
				var nestLevel = 0;
				var buffer = [];

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (true)
						{
							if (enumerator.moveNext())
							{
								buffer.push(enumerator.current());
								return this.yield(resultSelector(enumerator.current(), nestLevel));
							}

							var next = Enumerable.from(buffer).selectMany(function (x) { return func(x); });
							if (!next.any())
							{
								return false;
							}
							else
							{
								nestLevel++;
								buffer = [];
								Utils.dispose(enumerator);
								enumerator = next.getEnumerator();
							}
						}
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		// Overload:function(func)
		// Overload:function(func, resultSelector<element>)
		// Overload:function(func, resultSelector<element, nestLevel>)
		cascadeDepthFirst: function (func, resultSelector)
		{
			var source = this;
			func = Utils.createLambda(func);
			resultSelector = Utils.createLambda(resultSelector);

			return new Enumerable(function ()
			{
				var enumeratorStack = [];
				var enumerator;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (true)
						{
							if (enumerator.moveNext())
							{
								var value = resultSelector(enumerator.current(), enumeratorStack.length);
								enumeratorStack.push(enumerator);
								enumerator = Enumerable.from(func(enumerator.current())).getEnumerator();
								return this.yield(value);
							}

							if (enumeratorStack.length <= 0) return false;
							Utils.dispose(enumerator);
							enumerator = enumeratorStack.pop();
						}
					},
					function ()
					{
						try { Utils.dispose(enumerator); }
						finally { Enumerable.from(enumeratorStack).forEach(function (s) { s.dispose(); }) }
					});
			});
		},

		flatten: function ()
		{
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var middleEnumerator = null;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (true)
						{
							if (middleEnumerator != null)
							{
								if (middleEnumerator.moveNext())
								{
									return this.yield(middleEnumerator.current());
								}
								else
								{
									middleEnumerator = null;
								}
							}

							if (enumerator.moveNext())
							{
								if (enumerator.current() instanceof Array)
								{
									Utils.dispose(middleEnumerator);
									middleEnumerator = Enumerable.from(enumerator.current())
										.selectMany(Functions.Identity)
										.flatten()
										.getEnumerator();
									continue;
								}
								else
								{
									return this.yield(enumerator.current());
								}
							}

							return false;
						}
					},
					function ()
					{
						try { Utils.dispose(enumerator); }
						finally { Utils.dispose(middleEnumerator); }
					});
			});
		},

		pairwise: function (selector)
		{
			var source = this;
			selector = Utils.createLambda(selector);

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();
						enumerator.moveNext();
					},
					function ()
					{
						var prev = enumerator.current();
						return (enumerator.moveNext())
							? this.yield(selector(prev, enumerator.current()))
							: false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		// Overload:function(func)
		// Overload:function(seed,func<value,element>)
		// Overload:function(seed,func<value,element>,resultSelector)
		scan: function (seed, func, resultSelector)
		{
			if (resultSelector != null) return this.scan(seed, func).select(resultSelector);

			var isUseSeed;
			if (func == null)
			{
				func = Utils.createLambda(seed); // arguments[0]
				isUseSeed = false;
			}
			else
			{
				func = Utils.createLambda(func);
				isUseSeed = true;
			}
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var value;
				var isFirst = true;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						if (isFirst)
						{
							isFirst = false;
							if (!isUseSeed)
							{
								if (enumerator.moveNext())
								{
									return this.yield(value = enumerator.current());
								}
							}
							else
							{
								return this.yield(value = seed);
							}
						}

						return (enumerator.moveNext())
							? this.yield(value = func(value, enumerator.current()))
							: false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		// Overload:function(selector<element>)
		// Overload:function(selector<element,index>)
		select: function (selector)
		{
			var source = this;
			selector = Utils.createLambda(selector);

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						return (enumerator.moveNext())
							? this.yield(selector(enumerator.current(), index++))
							: false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function(collectionSelector<element>)
		// Overload:function(collectionSelector<element,index>)
		// Overload:function(collectionSelector<element>,resultSelector)
		// Overload:function(collectionSelector<element,index>,resultSelector)
		selectMany: function (collectionSelector, resultSelector)
		{
			var source = this;
			collectionSelector = Utils.createLambda(collectionSelector);
			if (resultSelector == null) resultSelector = function (a, b) { return b; }
			resultSelector = Utils.createLambda(resultSelector);

			return new Enumerable(function ()
			{
				var enumerator;
				var middleEnumerator = undefined;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						if (middleEnumerator === undefined)
						{
							if (!enumerator.moveNext()) return false;
						}
						do
						{
							if (middleEnumerator == null)
							{
								var middleSeq = collectionSelector(enumerator.current(), index++);
								middleEnumerator = Enumerable.from(middleSeq).getEnumerator();
							}
							if (middleEnumerator.moveNext())
							{
								return this.yield(resultSelector(enumerator.current(), middleEnumerator.current()));
							}
							Utils.dispose(middleEnumerator);
							middleEnumerator = null;
						} while (enumerator.moveNext())
						return false;
					},
					function ()
					{
						try { Utils.dispose(enumerator); }
						finally { Utils.dispose(middleEnumerator); }
					})
			});
		},

		// Overload:function(predicate<element>)
		// Overload:function(predicate<element,index>)
		where: function (predicate)
		{
			predicate = Utils.createLambda(predicate);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (enumerator.moveNext())
						{
							if (predicate(enumerator.current(), index++))
							{
								return this.yield(enumerator.current());
							}
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		ofType: function (type)
		{
			var typeName;
			switch (type)
			{
				case Number: typeName = Types.Number; break;
				case String: typeName = Types.String; break;
				case Boolean: typeName = Types.Boolean; break;
				case Function: typeName = Types.Function; break;
				default: typeName = null; break;
			}
			return (typeName === null)
				? this.where(function (x) { return x instanceof type })
				: this.where(function (x) { return typeof x === typeName });
		},

		// Overload:function(second,selector<outer,inner>)
		// Overload:function(second,selector<outer,inner,index>)
		zip: function (second, selector)
		{
			selector = Utils.createLambda(selector);
			var source = this;

			return new Enumerable(function ()
			{
				var firstEnumerator;
				var secondEnumerator;
				var index = 0;

				return new IEnumerator(
					function ()
					{
						firstEnumerator = source.getEnumerator();
						secondEnumerator = Enumerable.from(second).getEnumerator();
					},
					function ()
					{
						if (firstEnumerator.moveNext() && secondEnumerator.moveNext())
						{
							return this.yield(selector(firstEnumerator.current(), secondEnumerator.current(), index++));
						}
						return false;
					},
					function ()
					{
						try { Utils.dispose(firstEnumerator); }
						finally { Utils.dispose(secondEnumerator); }
					})
			});
		},

		/* Join Methods */

		// Overload:function (inner, outerKeySelector, innerKeySelector, resultSelector)
		// Overload:function (inner, outerKeySelector, innerKeySelector, resultSelector, compareSelector)
		join: function (inner, outerKeySelector, innerKeySelector, resultSelector, compareSelector)
		{
			outerKeySelector = Utils.createLambda(outerKeySelector);
			innerKeySelector = Utils.createLambda(innerKeySelector);
			resultSelector = Utils.createLambda(resultSelector);
			compareSelector = Utils.createLambda(compareSelector);
			var source = this;

			return new Enumerable(function ()
			{
				var outerEnumerator;
				var lookup;
				var innerElements = null;
				var innerCount = 0;

				return new IEnumerator(
					function ()
					{
						outerEnumerator = source.getEnumerator();
						lookup = Enumerable.from(inner).toLookup(innerKeySelector, Functions.Identity, compareSelector);
					},
					function ()
					{
						while (true)
						{
							if (innerElements != null)
							{
								var innerElement = innerElements[innerCount++];
								if (innerElement !== undefined)
								{
									return this.yield(resultSelector(outerEnumerator.current(), innerElement));
								}

								innerElement = null;
								innerCount = 0;
							}

							if (outerEnumerator.moveNext())
							{
								var key = outerKeySelector(outerEnumerator.current());
								innerElements = lookup.get(key).toArray();
							}
							else
							{
								return false;
							}
						}
					},
					function () { Utils.dispose(outerEnumerator); })
			});
		},

		// Overload:function (inner, outerKeySelector, innerKeySelector, resultSelector)
		// Overload:function (inner, outerKeySelector, innerKeySelector, resultSelector, compareSelector)
		groupJoin: function (inner, outerKeySelector, innerKeySelector, resultSelector, compareSelector)
		{
			outerKeySelector = Utils.createLambda(outerKeySelector);
			innerKeySelector = Utils.createLambda(innerKeySelector);
			resultSelector = Utils.createLambda(resultSelector);
			compareSelector = Utils.createLambda(compareSelector);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator = source.getEnumerator();
				var lookup = null;

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();
						lookup = Enumerable.from(inner).toLookup(innerKeySelector, Functions.Identity, compareSelector);
					},
					function ()
					{
						if (enumerator.moveNext())
						{
							var innerElement = lookup.get(outerKeySelector(enumerator.current()));
							return this.yield(resultSelector(enumerator.current(), innerElement));
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		/* Set Methods */

		all: function (predicate)
		{
			predicate = Utils.createLambda(predicate);

			var result = true;
			this.forEach(function (x)
			{
				if (!predicate(x))
				{
					result = false;
					return false; // break
				}
			});
			return result;
		},

		// Overload:function()
		// Overload:function(predicate)
		any: function (predicate)
		{
			predicate = Utils.createLambda(predicate);

			var enumerator = this.getEnumerator();
			try
			{
				if (arguments.length == 0) return enumerator.moveNext(); // case:function()

				while (enumerator.moveNext()) // case:function(predicate)
				{
					if (predicate(enumerator.current())) return true;
				}
				return false;
			}
			finally { Utils.dispose(enumerator); }
		},

		concat: function (second)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var firstEnumerator;
				var secondEnumerator;

				return new IEnumerator(
					function () { firstEnumerator = source.getEnumerator(); },
					function ()
					{
						if (secondEnumerator == null)
						{
							if (firstEnumerator.moveNext()) return this.yield(firstEnumerator.current());
							secondEnumerator = Enumerable.from(second).getEnumerator();
						}
						if (secondEnumerator.moveNext()) return this.yield(secondEnumerator.current());
						return false;
					},
					function ()
					{
						try { Utils.dispose(firstEnumerator); }
						finally { Utils.dispose(secondEnumerator); }
					})
			});
		},

		insert: function (index, second)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var firstEnumerator;
				var secondEnumerator;
				var count = 0;
				var isEnumerated = false;

				return new IEnumerator(
					function ()
					{
						firstEnumerator = source.getEnumerator();
						secondEnumerator = Enumerable.from(second).getEnumerator();
					},
					function ()
					{
						if (count == index && secondEnumerator.moveNext())
						{
							isEnumerated = true;
							return this.yield(secondEnumerator.current());
						}
						if (firstEnumerator.moveNext())
						{
							count++;
							return this.yield(firstEnumerator.current());
						}
						if (!isEnumerated && secondEnumerator.moveNext())
						{
							return this.yield(secondEnumerator.current());
						}
						return false;
					},
					function ()
					{
						try { Utils.dispose(firstEnumerator); }
						finally { Utils.dispose(secondEnumerator); }
					})
			});
		},

		alternate: function (value)
		{
			value = Enumerable.return$(value);
			return this.selectMany(function (elem)
			{
				return Enumerable.return$(elem).concat(value);
			}).takeExceptLast();
		},

		// Overload:function(value)
		// Overload:function(value, compareSelector)
		contains: function (value, compareSelector)
		{
			compareSelector = Utils.createLambda(compareSelector);
			var enumerator = this.getEnumerator();
			try
			{
				while (enumerator.moveNext())
				{
					if (compareSelector(enumerator.current()) === value) return true;
				}
				return false;
			}
			finally { Utils.dispose(enumerator) }
		},

		defaultIfEmpty: function (defaultValue)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var isFirst = true;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						if (enumerator.moveNext())
						{
							isFirst = false;
							return this.yield(enumerator.current());
						}
						else if (isFirst)
						{
							isFirst = false;
							return this.yield(defaultValue);
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function()
		// Overload:function(compareSelector)
		distinct: function (compareSelector)
		{
			return this.Except(Enumerable.empty(), compareSelector);
		},

		// Overload:function(second)
		// Overload:function(second, compareSelector)
		Except: function (second, compareSelector)
		{
			compareSelector = Utils.createLambda(compareSelector);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var keys;

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();
						keys = new Dictionary(compareSelector);
						Enumerable.from(second).forEach(function (key) { keys.add(key); });
					},
					function ()
					{
						while (enumerator.moveNext())
						{
							var current = enumerator.current();
							if (!keys.contains(current))
							{
								keys.add(current);
								return this.yield(current);
							}
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function(second)
		// Overload:function(second, compareSelector)
		intersect: function (second, compareSelector)
		{
			compareSelector = Utils.createLambda(compareSelector);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var keys;
				var outs;

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();

						keys = new Dictionary(compareSelector);
						Enumerable.from(second).forEach(function (key) { keys.add(key); });
						outs = new Dictionary(compareSelector);
					},
					function ()
					{
						while (enumerator.moveNext())
						{
							var current = enumerator.current();
							if (!outs.contains(current) && keys.contains(current))
							{
								outs.add(current);
								return this.yield(current);
							}
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function(second)
		// Overload:function(second, compareSelector)
		sequenceEqual: function (second, compareSelector)
		{
			compareSelector = Utils.createLambda(compareSelector);

			var firstEnumerator = this.getEnumerator();
			try
			{
				var secondEnumerator = Enumerable.from(second).getEnumerator();
				try
				{
					while (firstEnumerator.moveNext())
					{
						if (!secondEnumerator.moveNext()
							|| compareSelector(firstEnumerator.current()) !== compareSelector(secondEnumerator.current()))
						{
							return false;
						}
					}

					if (secondEnumerator.moveNext()) return false;
					return true;
				}
				finally { Utils.dispose(secondEnumerator); }
			}
			finally { Utils.dispose(firstEnumerator); }
		},

		union: function (second, compareSelector)
		{
			compareSelector = Utils.createLambda(compareSelector);
			var source = this;

			return new Enumerable(function ()
			{
				var firstEnumerator;
				var secondEnumerator;
				var keys;

				return new IEnumerator(
					function ()
					{
						firstEnumerator = source.getEnumerator();
						keys = new Dictionary(compareSelector);
					},
					function ()
					{
						var current;
						if (secondEnumerator === undefined)
						{
							while (firstEnumerator.moveNext())
							{
								current = firstEnumerator.current();
								if (!keys.contains(current))
								{
									keys.add(current);
									return this.yield(current);
								}
							}
							secondEnumerator = Enumerable.from(second).getEnumerator();
						}
						while (secondEnumerator.moveNext())
						{
							current = secondEnumerator.current();
							if (!keys.contains(current))
							{
								keys.add(current);
								return this.yield(current);
							}
						}
						return false;
					},
					function ()
					{
						try { Utils.dispose(firstEnumerator); }
						finally { Utils.dispose(secondEnumerator); }
					})
			});
		},

		/* Ordering Methods */

		orderBy: function (keySelector)
		{
			return new OrderedEnumerable(this, keySelector, false);
		},

		orderByDescending: function (keySelector)
		{
			return new OrderedEnumerable(this, keySelector, true);
		},

		reverse: function ()
		{
			var source = this;

			return new Enumerable(function ()
			{
				var buffer;
				var index;

				return new IEnumerator(
					function ()
					{
						buffer = source.toArray();
						index = buffer.length;
					},
					function ()
					{
						return (index > 0)
							? this.yield(buffer[--index])
							: false;
					},
					Functions.Blank)
			});
		},

		shuffle: function ()
		{
			var source = this;

			return new Enumerable(function ()
			{
				var buffer;

				return new IEnumerator(
					function () { buffer = source.toArray(); },
					function ()
					{
						if (buffer.length > 0)
						{
							var i = Math.floor(Math.random() * buffer.length);
							return this.yield(buffer.splice(i, 1)[0]);
						}
						return false;
					},
					Functions.Blank)
			});
		},

		/* Grouping Methods */

		// Overload:function(keySelector)
		// Overload:function(keySelector,elementSelector)
		// Overload:function(keySelector,elementSelector,resultSelector)
		// Overload:function(keySelector,elementSelector,resultSelector,compareSelector)
		groupBy: function (keySelector, elementSelector, resultSelector, compareSelector)
		{
			var source = this;
			keySelector = Utils.createLambda(keySelector);
			elementSelector = Utils.createLambda(elementSelector);
			if (resultSelector != null) resultSelector = Utils.createLambda(resultSelector);
			compareSelector = Utils.createLambda(compareSelector);

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
					function ()
					{
						enumerator = source.toLookup(keySelector, elementSelector, compareSelector)
							.toEnumerable()
							.getEnumerator();
					},
					function ()
					{
						while (enumerator.moveNext())
						{
							return (resultSelector == null)
								? this.yield(enumerator.current())
								: this.yield(resultSelector(enumerator.current().key(), enumerator.current()));
						}
						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function(keySelector)
		// Overload:function(keySelector,elementSelector)
		// Overload:function(keySelector,elementSelector,resultSelector)
		// Overload:function(keySelector,elementSelector,resultSelector,compareSelector)
		partitionBy: function (keySelector, elementSelector, resultSelector, compareSelector)
		{

			var source = this;
			keySelector = Utils.createLambda(keySelector);
			elementSelector = Utils.createLambda(elementSelector);
			compareSelector = Utils.createLambda(compareSelector);
			var hasResultSelector;
			if (resultSelector == null)
			{
				hasResultSelector = false;
				resultSelector = function (key, group) { return new Grouping(key, group) }
			}
			else
			{
				hasResultSelector = true;
				resultSelector = Utils.createLambda(resultSelector);
			}

			return new Enumerable(function ()
			{
				var enumerator;
				var key;
				var compareKey;
				var group = [];

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();
						if (enumerator.moveNext())
						{
							key = keySelector(enumerator.current());
							compareKey = compareSelector(key);
							group.push(elementSelector(enumerator.current()));
						}
					},
					function ()
					{
						var hasNext;
						while ((hasNext = enumerator.moveNext()) == true)
						{
							if (compareKey === compareSelector(keySelector(enumerator.current())))
							{
								group.push(elementSelector(enumerator.current()));
							}
							else break;
						}

						if (group.length > 0)
						{
							var result = (hasResultSelector)
								? resultSelector(key, Enumerable.from(group))
								: resultSelector(key, group);
							if (hasNext)
							{
								key = keySelector(enumerator.current());
								compareKey = compareSelector(key);
								group = [elementSelector(enumerator.current())];
							}
							else group = [];

							return this.yield(result);
						}

						return false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		bufferWithCount: function (count)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
				function () { enumerator = source.getEnumerator(); },
				function ()
				{
					var array = [];
					var index = 0;
					while (enumerator.moveNext())
					{
						array.push(enumerator.current());
						if (++index >= count) return this.yield(array);
					}
					if (array.length > 0) return this.yield(array);
					return false;
				},
				function () { Utils.dispose(enumerator); })
			});
		},

		/* Aggregate Methods */

		// Overload:function(func)
		// Overload:function(seed,func)
		// Overload:function(seed,func,resultSelector)
		aggregate: function (seed, func, resultSelector)
		{
			return this.scan(seed, func, resultSelector).last();
		},

		// Overload:function()
		// Overload:function(selector)
		average: function (selector)
		{
			selector = Utils.createLambda(selector);

			var sum = 0;
			var count = 0;
			this.forEach(function (x)
			{
				sum += selector(x);
				++count;
			});

			return sum / count;
		},

		// Overload:function()
		// Overload:function(predicate)
		count: function (predicate)
		{
			predicate = (predicate == null) ? Functions.True : Utils.createLambda(predicate);

			var count = 0;
			this.forEach(function (x, i)
			{
				if (predicate(x, i)) ++count;
			});
			return count;
		},

		// Overload:function()
		// Overload:function(selector)
		max: function (selector)
		{
			if (selector == null) selector = Functions.Identity;
			return this.select(selector).aggregate(function (a, b) { return (a > b) ? a : b; });
		},

		// Overload:function()
		// Overload:function(selector)
		min: function (selector)
		{
			if (selector == null) selector = Functions.Identity;
			return this.select(selector).aggregate(function (a, b) { return (a < b) ? a : b; });
		},

		maxBy: function (keySelector)
		{
			keySelector = Utils.createLambda(keySelector);
			return this.aggregate(function (a, b) { return (keySelector(a) > keySelector(b)) ? a : b });
		},

		minBy: function (keySelector)
		{
			keySelector = Utils.createLambda(keySelector);
			return this.aggregate(function (a, b) { return (keySelector(a) < keySelector(b)) ? a : b });
		},

		// Overload:function()
		// Overload:function(selector)
		sum: function (selector)
		{
			if (selector == null) selector = Functions.Identity;
			return this.select(selector).aggregate(0, function (a, b) { return a + b; });
		},

		/* Paging Methods */

		elementAt: function (index)
		{
			var value;
			var found = false;
			this.forEach(function (x, i)
			{
				if (i == index)
				{
					value = x;
					found = true;
					return false;
				}
			});

			if (!found) throw new Error("index is less than 0 or greater than or equal to the number of elements in source.");
			return value;
		},

		elementAtOrDefault: function (index, defaultValue)
		{
			var value;
			var found = false;
			this.forEach(function (x, i)
			{
				if (i == index)
				{
					value = x;
					found = true;
					return false;
				}
			});

			return (!found) ? defaultValue : value;
		},

		// Overload:function()
		// Overload:function(predicate)
		first: function (predicate)
		{
			if (predicate != null) return this.where(predicate).first();

			var value;
			var found = false;
			this.forEach(function (x)
			{
				value = x;
				found = true;
				return false;
			});

			if (!found) throw new Error("First:No element satisfies the condition.");
			return value;
		},

		// Overload:function(defaultValue)
		// Overload:function(defaultValue,predicate)
		firstOrDefault: function (defaultValue, predicate)
		{
			if (predicate != null) return this.where(predicate).firstOrDefault(defaultValue);

			var value;
			var found = false;
			this.forEach(function (x)
			{
				value = x;
				found = true;
				return false;
			});
			return (!found) ? defaultValue : value;
		},

		// Overload:function()
		// Overload:function(predicate)
		last: function (predicate)
		{
			if (predicate != null) return this.where(predicate).last();

			var value;
			var found = false;
			this.forEach(function (x)
			{
				found = true;
				value = x;
			});

			if (!found) throw new Error("Last:No element satisfies the condition.");
			return value;
		},

		// Overload:function(defaultValue)
		// Overload:function(defaultValue,predicate)
		lastOrDefault: function (defaultValue, predicate)
		{
			if (predicate != null) return this.where(predicate).lastOrDefault(defaultValue);

			var value;
			var found = false;
			this.forEach(function (x)
			{
				found = true;
				value = x;
			});
			return (!found) ? defaultValue : value;
		},

		// Overload:function()
		// Overload:function(predicate)
		single: function (predicate)
		{
			if (predicate != null) return this.where(predicate).single();

			var value;
			var found = false;
			this.forEach(function (x)
			{
				if (!found)
				{
					found = true;
					value = x;
				}
				else throw new Error("Single:sequence contains more than one element.");
			});

			if (!found) throw new Error("Single:No element satisfies the condition.");
			return value;
		},

		// Overload:function(defaultValue)
		// Overload:function(defaultValue,predicate)
		singleOrDefault: function (defaultValue, predicate)
		{
			if (predicate != null) return this.where(predicate).singleOrDefault(defaultValue);

			var value;
			var found = false;
			this.forEach(function (x)
			{
				if (!found)
				{
					found = true;
					value = x;
				}
				else throw new Error("Single:sequence contains more than one element.");
			});

			return (!found) ? defaultValue : value;
		},

		skip: function (count)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function ()
					{
						enumerator = source.getEnumerator();
						while (index++ < count && enumerator.moveNext()) { };
					},
					function ()
					{
						return (enumerator.moveNext())
							? this.yield(enumerator.current())
							: false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		// Overload:function(predicate<element>)
		// Overload:function(predicate<element,index>)
		skipWhile: function (predicate)
		{
			predicate = Utils.createLambda(predicate);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;
				var isSkipEnd = false;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (!isSkipEnd)
						{
							if (enumerator.moveNext())
							{
								if (!predicate(enumerator.current(), index++))
								{
									isSkipEnd = true;
									return this.yield(enumerator.current());
								}
								continue;
							}
							else return false;
						}

						return (enumerator.moveNext())
							? this.yield(enumerator.current())
							: false;

					},
					function () { Utils.dispose(enumerator); });
			});
		},

		take: function (count)
		{
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						return (index++ < count && enumerator.moveNext())
							? this.yield(enumerator.current())
							: false;
					},
					function () { Utils.dispose(enumerator); }
				)
			});
		},

		// Overload:function(predicate<element>)
		// Overload:function(predicate<element,index>)
		takeWhile: function (predicate)
		{
			predicate = Utils.createLambda(predicate);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						return (enumerator.moveNext() && predicate(enumerator.current(), index++))
							? this.yield(enumerator.current())
							: false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		// Overload:function()
		// Overload:function(count)
		takeExceptLast: function (count)
		{
			if (count == null) count = 1;
			var source = this;

			return new Enumerable(function ()
			{
				if (count <= 0) return source.getEnumerator(); // do nothing

				var enumerator;
				var q = [];

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						while (enumerator.moveNext())
						{
							if (q.length == count)
							{
								q.push(enumerator.current());
								return this.yield(q.shift());
							}
							q.push(enumerator.current());
						}
						return false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		takeFromLast: function (count)
		{
			if (count <= 0 || count == null) return Enumerable.empty();
			var source = this;

			return new Enumerable(function ()
			{
				var sourceEnumerator;
				var enumerator;
				var q = [];

				return new IEnumerator(
					function () { sourceEnumerator = source.getEnumerator(); },
					function ()
					{
						while (sourceEnumerator.moveNext())
						{
							if (q.length == count) q.shift()
							q.push(sourceEnumerator.current());
						}
						if (enumerator == null)
						{
							enumerator = Enumerable.from(q).getEnumerator();
						}
						return (enumerator.moveNext())
							? this.yield(enumerator.current())
							: false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		indexOf: function (item)
		{
			var found = null;
			this.forEach(function (x, i)
			{
				if (x === item)
				{
					found = i;
					return true;
				}
			});

			return (found !== null) ? found : -1;
		},

		lastIndexOf: function (item)
		{
			var result = -1;
			this.forEach(function (x, i)
			{
				if (x === item) result = i;
			});

			return result;
		},

		/* Convert Methods */

		toArray: function ()
		{
			var array = [];
			this.forEach(function (x) { array.push(x) });
			return array;
		},

		// Overload:function(keySelector)
		// Overload:function(keySelector, elementSelector)
		// Overload:function(keySelector, elementSelector, compareSelector)
		toLookup: function (keySelector, elementSelector, compareSelector)
		{
			keySelector = Utils.createLambda(keySelector);
			elementSelector = Utils.createLambda(elementSelector);
			compareSelector = Utils.createLambda(compareSelector);

			var dict = new Dictionary(compareSelector);
			this.forEach(function (x)
			{
				var key = keySelector(x);
				var element = elementSelector(x);

				var array = dict.get(key);
				if (array !== undefined) array.push(element);
				else dict.add(key, [element]);
			});
			return new Lookup(dict);
		},

		toObject: function (keySelector, elementSelector)
		{
			keySelector = Utils.createLambda(keySelector);
			elementSelector = Utils.createLambda(elementSelector);

			var obj = {};
			this.forEach(function (x)
			{
				obj[keySelector(x)] = elementSelector(x);
			});
			return obj;
		},

		// Overload:function(keySelector, elementSelector)
		// Overload:function(keySelector, elementSelector, compareSelector)
		toDictionary: function (keySelector, elementSelector, compareSelector)
		{
			keySelector = Utils.createLambda(keySelector);
			elementSelector = Utils.createLambda(elementSelector);
			compareSelector = Utils.createLambda(compareSelector);

			var dict = new Dictionary(compareSelector);
			this.forEach(function (x)
			{
				dict.add(keySelector(x), elementSelector(x));
			});
			return dict;
		},

		// Overload:function()
		// Overload:function(replacer)
		// Overload:function(replacer, space)
		toJSON: function (replacer, space)
		{
			return JSON.stringify(this.toArray(), replacer, space);
		},

		// Overload:function()
		// Overload:function(separator)
		// Overload:function(separator,selector)
		toString: function (separator, selector)
		{
			if (separator == null) separator = "";
			if (selector == null) selector = Functions.Identity;

			return this.select(selector).toArray().join(separator);
		},


		/* Action Methods */

		// Overload:function(action<element>)
		// Overload:function(action<element,index>)
		do$: function (action)
		{
			var source = this;
			action = Utils.createLambda(action);

			return new Enumerable(function ()
			{
				var enumerator;
				var index = 0;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						if (enumerator.moveNext())
						{
							action(enumerator.current(), index++);
							return this.yield(enumerator.current());
						}
						return false;
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		// Overload:function(action<element>)
		// Overload:function(action<element,index>)
		// Overload:function(func<element,bool>)
		// Overload:function(func<element,index,bool>)
		forEach: function (action)
		{
			action = Utils.createLambda(action);

			var index = 0;
			var enumerator = this.getEnumerator();
			try
			{
				while (enumerator.moveNext())
				{
					if (action(enumerator.current(), index++) === false) break;
				}
			}
			finally { Utils.dispose(enumerator); }
		},

		// Overload:function()
		// Overload:function(separator)
		// Overload:function(separator,selector)
		write: function (separator, selector)
		{
			if (separator == null) separator = "";
			selector = Utils.createLambda(selector);

			var isFirst = true;
			this.forEach(function (item)
			{
				if (isFirst) isFirst = false;
				else document.write(separator);
				document.write(selector(item));
			});
		},

		// Overload:function()
		// Overload:function(selector)
		writeLine: function (selector)
		{
			selector = Utils.createLambda(selector);

			this.forEach(function (item)
			{
				document.write(selector(item));
				document.write("<br />");
			});
		},

		force: function ()
		{
			var enumerator = this.getEnumerator();

			try { while (enumerator.moveNext()) { } }
			finally { Utils.dispose(enumerator); }
		},

		/* Functional Methods */

		let: function (func)
		{
			func = Utils.createLambda(func);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
					function ()
					{
						enumerator = Enumerable.from(func(source)).getEnumerator();
					},
					function ()
					{
						return (enumerator.moveNext())
							? this.yield(enumerator.current())
							: false;
					},
					function () { Utils.dispose(enumerator); })
			});
		},

		share: function ()
		{
			var source = this;
			var sharedEnumerator;

			return new Enumerable(function ()
			{
				return new IEnumerator(
					function ()
					{
						if (sharedEnumerator == null)
						{
							sharedEnumerator = source.getEnumerator();
						}
					},
					function ()
					{
						return (sharedEnumerator.moveNext())
							? this.yield(sharedEnumerator.current())
							: false;
					},
					Functions.Blank
				)
			});
		},

		memoizeAll: function ()
		{
			var source = this;
			var cache;
			var enumerator;

			return new Enumerable(function ()
			{
				var index = -1;

				return new IEnumerator(
					function ()
					{
						if (enumerator == null)
						{
							enumerator = source.getEnumerator();
							cache = [];
						}
					},
					function ()
					{
						index++;
						if (cache.length <= index)
						{
							return (enumerator.moveNext())
								? this.yield(cache[index] = enumerator.current())
								: false;
						}

						return this.yield(cache[index]);
					},
					Functions.Blank
				)
			});
		},

		/* Error Handling Methods */

		catch$: function (handler)
		{
			handler = Utils.createLambda(handler);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						try
						{
							return (enumerator.moveNext())
							   ? this.yield(enumerator.current())
							   : false;
						}
						catch (e)
						{
							handler(e);
							return false;
						}
					},
					function () { Utils.dispose(enumerator); });
			});
		},

		finally$: function (finallyAction)
		{
			finallyAction = Utils.createLambda(finallyAction);
			var source = this;

			return new Enumerable(function ()
			{
				var enumerator;

				return new IEnumerator(
					function () { enumerator = source.getEnumerator(); },
					function ()
					{
						return (enumerator.moveNext())
						   ? this.yield(enumerator.current())
						   : false;
					},
					function ()
					{
						try { Utils.dispose(enumerator); }
						finally { finallyAction(); }
					});
			});
		},

		/* For Debug Methods */

		// Overload:function()
		// Overload:function(message)
		// Overload:function(message,selector)
		trace: function (message, selector)
		{
			if (message == null) message = "Trace";
			selector = Utils.createLambda(selector);

			return this.do$(function (item)
			{
				console.log(message, ":", selector(item));
			});
		}
	};

	// private

	// static functions
	var Functions =
	{
		Identity: function (x) { return x; },
		True: function () { return true; },
		Blank: function () { }
	};

	// static const
	var Types =
	{
		Boolean: typeof true,
		Number: typeof 0,
		String: typeof "",
		Object: typeof {},
		Undefined: typeof undefined,
		Function: typeof function () { }
	};

	// static utility methods
	var Utils =
	{
		// Create anonymous function from lambda expression string
		createLambda: function (expression)
		{
			if (expression == null) return Functions.Identity;
			if (typeof expression == Types.String)
			{
				if (expression == "")
				{
					return Functions.Identity;
				}
				else if (expression.indexOf("=>") == -1)
				{
					return new Function("$,$$,$$$,$$$$", "return " + expression);
				}
				else
				{
					var expr = expression.match(/^[(\s]*([^()]*?)[)\s]*=>(.*)/);
					return new Function(expr[1], "return " + expr[2]);
				}
			}
			return expression;
		},

		isIEnumerable: function (obj)
		{
			if (typeof Enumerator != Types.Undefined)
			{
				try
				{
					new Enumerator(obj);
					return true;
				}
				catch (e) { }
			}
			return false;
		},

		compare: function (a, b)
		{
			return (a === b) ? 0
				: (a > b) ? 1
				: -1;
		},

		dispose: function (obj)
		{
			if (obj != null) obj.dispose();
		}
	};

	// IEnumerator State
	var State = { Before: 0, Running: 1, After: 2 };

	// name "Enumerator" is conflict JScript's "Enumerator"
	var IEnumerator = function (initialize, tryGetNext, dispose)
	{
		var yielder = new Yielder();
		var state = State.Before;

		this.current = yielder.current;
		this.moveNext = function ()
		{
			try
			{
				switch (state)
				{
					case State.Before:
						state = State.Running;
						initialize(); // fall through
					case State.Running:
						if (tryGetNext.apply(yielder))
						{
							return true;
						}
						else
						{
							this.dispose();
							return false;
						}
					case State.After:
						return false;
				}
			}
			catch (e)
			{
				this.dispose();
				throw e;
			}
		};

		this.dispose = function ()
		{
			if (state != State.Running) return;

			try { dispose(); }
			finally { state = State.After; }
		};
	};

	// for tryGetNext
	var Yielder = function ()
	{
		var current = null;
		this.current = function () { return current; }
		this.yield = function (value)
		{
			current = value;
			return true;
		};
	};

	// for OrderBy/ThenBy

	var OrderedEnumerable = function (source, keySelector, descending, parent)
	{
		this.source = source;
		this.keySelector = Utils.createLambda(keySelector);
		this.descending = descending;
		this.parent = parent;
	};

	OrderedEnumerable.prototype = new Enumerable();

	OrderedEnumerable.prototype.createOrderedEnumerable = function (keySelector, descending)
	{
		return new OrderedEnumerable(this.source, keySelector, descending, this);
	};

	OrderedEnumerable.prototype.thenBy = function (keySelector)
	{
		return this.createOrderedEnumerable(keySelector, false);
	};

	OrderedEnumerable.prototype.thenByDescending = function (keySelector)
	{
		return this.createOrderedEnumerable(keySelector, true);
	};

	OrderedEnumerable.prototype.getEnumerator = function ()
	{
		var self = this;
		var buffer;
		var indexes;
		var index = 0;

		return new IEnumerator(
			function ()
			{
				buffer = [];
				indexes = [];
				self.source.forEach(function (item, index)
				{
					buffer.push(item);
					indexes.push(index);
				});
				var sortContext = SortContext.create(self, null);
				sortContext.generateKeys(buffer);

				indexes.sort(function (a, b) { return sortContext.compare(a, b); });
			},
			function ()
			{
				return (index < indexes.length)
					? this.yield(buffer[indexes[index++]])
					: false;
			},
			Functions.Blank
		)
	};

	var SortContext = function (keySelector, descending, child)
	{
		this.keySelector = keySelector;
		this.descending = descending;
		this.child = child;
		this.keys = null;
	};

	SortContext.create = function (orderedEnumerable, currentContext)
	{
		var context = new SortContext(orderedEnumerable.keySelector, orderedEnumerable.descending, currentContext);
		if (orderedEnumerable.parent != null) return SortContext.create(orderedEnumerable.parent, context);
		return context;
	};

	SortContext.prototype.generateKeys = function (source)
	{
		var len = source.length;
		var keySelector = this.keySelector;
		var keys = new Array(len);
		for (var i = 0; i < len; i++) keys[i] = keySelector(source[i]);
		this.keys = keys;

		if (this.child != null) this.child.generateKeys(source);
	};

	SortContext.prototype.compare = function (index1, index2)
	{
		var comparison = Utils.compare(this.keys[index1], this.keys[index2]);

		if (comparison == 0)
		{
			if (this.child != null) return this.child.compare(index1, index2)
			comparison = Utils.compare(index1, index2);
		}

		return (this.descending) ? -comparison : comparison;
	};

	// optimize array or arraylike object

	var ArrayEnumerable = function (source)
	{
		this.source = source;
	};
	ArrayEnumerable.prototype = new Enumerable();

	ArrayEnumerable.prototype.any = function (predicate)
	{
		return (predicate == null)
			? (this.source.length > 0)
			: Enumerable.prototype.any.apply(this, arguments);
	};

	ArrayEnumerable.prototype.count = function (predicate)
	{
		return (predicate == null)
			? this.source.length
			: Enumerable.prototype.count.apply(this, arguments);
	};

	ArrayEnumerable.prototype.elementAt = function (index)
	{
		return (0 <= index && index < this.source.length)
			? this.source[index]
			: Enumerable.prototype.elementAt.apply(this, arguments);
	};

	ArrayEnumerable.prototype.elementAtOrDefault = function (index, defaultValue)
	{
		return (0 <= index && index < this.source.length)
			? this.source[index]
			: defaultValue;
	};

	ArrayEnumerable.prototype.first = function (predicate)
	{
		return (predicate == null && this.source.length > 0)
			? this.source[0]
			: Enumerable.prototype.first.apply(this, arguments);
	};

	ArrayEnumerable.prototype.firstOrDefault = function (defaultValue, predicate)
	{
		if (predicate != null)
		{
			return Enumerable.prototype.firstOrDefault.apply(this, arguments);
		}

		return this.source.length > 0 ? this.source[0] : defaultValue;
	};

	ArrayEnumerable.prototype.last = function (predicate)
	{
		return (predicate == null && this.source.length > 0)
			? this.source[this.source.length - 1]
			: Enumerable.prototype.last.apply(this, arguments);
	};

	ArrayEnumerable.prototype.lastOrDefault = function (defaultValue, predicate)
	{
		if (predicate != null)
		{
			return Enumerable.prototype.lastOrDefault.apply(this, arguments);
		}

		return this.source.length > 0 ? this.source[this.source.length - 1] : defaultValue;
	};

	ArrayEnumerable.prototype.skip = function (count)
	{
		var source = this.source;

		return new Enumerable(function ()
		{
			var index;

			return new IEnumerator(
				function () { index = (count < 0) ? 0 : count },
				function ()
				{
					return (index < source.length)
						? this.yield(source[index++])
						: false;
				},
				Functions.Blank);
		});
	};

	ArrayEnumerable.prototype.takeExceptLast = function (count)
	{
		if (count == null) count = 1;
		return this.take(this.source.length - count);
	};

	ArrayEnumerable.prototype.takeFromLast = function (count)
	{
		return this.skip(this.source.length - count);
	};

	ArrayEnumerable.prototype.reverse = function ()
	{
		var source = this.source;

		return new Enumerable(function ()
		{
			var index;

			return new IEnumerator(
				function ()
				{
					index = source.length;
				},
				function ()
				{
					return (index > 0)
						? this.yield(source[--index])
						: false;
				},
				Functions.Blank)
		});
	};

	ArrayEnumerable.prototype.sequenceEqual = function (second, compareSelector)
	{
		if ((second instanceof ArrayEnumerable || second instanceof Array)
			&& compareSelector == null
			&& Enumerable.from(second).count() != this.count())
		{
			return false;
		}

		return Enumerable.prototype.sequenceEqual.apply(this, arguments);
	};

	ArrayEnumerable.prototype.toString = function (separator, selector)
	{
		if (selector != null || !(this.source instanceof Array))
		{
			return Enumerable.prototype.toString.apply(this, arguments);
		}

		if (separator == null) separator = "";
		return this.source.join(separator);
	};

	ArrayEnumerable.prototype.getEnumerator = function ()
	{
		var source = this.source;
		var index = 0;

		return new IEnumerator(
			Functions.Blank,
			function ()
			{
				return (index < source.length)
					? this.yield(source[index++])
					: false;
			},
			Functions.Blank);
	};

	// Collections

	var Dictionary = (function ()
	{
		// static utility methods
		var HasOwnProperty = function (target, key)
		{
			return Object.prototype.hasOwnProperty.call(target, key);
		};

		var ComputeHashCode = function (obj)
		{
			if (obj === null) return "null";
			if (obj === undefined) return "undefined";

			return (typeof obj.toString === Types.Function)
				? obj.toString()
				: Object.prototype.toString.call(obj);
		};

		// LinkedList for Dictionary
		var HashEntry = function (key, value)
		{
			this.key = key;
			this.value = value;
			this.prev = null;
			this.next = null;
		};

		var EntryList = function ()
		{
			this.first = null;
			this.last = null;
		};

		EntryList.prototype =
		{
			addLast: function (entry)
			{
				if (this.last != null)
				{
					this.last.next = entry;
					entry.prev = this.last;
					this.last = entry;
				}
				else this.first = this.last = entry;
			},

			replace: function (entry, newEntry)
			{
				if (entry.prev != null)
				{
					entry.prev.next = newEntry;
					newEntry.prev = entry.prev;
				}
				else this.first = newEntry;

				if (entry.next != null)
				{
					entry.next.prev = newEntry;
					newEntry.next = entry.next;
				}
				else this.last = newEntry;

			},

			remove: function (entry)
			{
				if (entry.prev != null) entry.prev.next = entry.next;
				else this.first = entry.next;

				if (entry.next != null) entry.next.prev = entry.prev;
				else this.last = entry.prev;
			}
		};

		// Overload:function()
		// Overload:function(compareSelector)
		var Dictionary = function (compareSelector)
		{
			this.count = 0;
			this.entryList = new EntryList();
			this.buckets = {}; // as Dictionary<string,List<object>>
			this.compareSelector = (compareSelector == null) ? Functions.Identity : compareSelector;
		};

		Dictionary.prototype =
		{
			add: function (key, value)
			{
				var compareKey = this.compareSelector(key);
				var hash = ComputeHashCode(compareKey);
				var entry = new HashEntry(key, value);
				if (HasOwnProperty(this.buckets, hash))
				{
					var array = this.buckets[hash];
					for (var i = 0; i < array.length; i++)
					{
						if (this.compareSelector(array[i].key) === compareKey)
						{
							this.entryList.replace(array[i], entry);
							array[i] = entry;
							return;
						}
					}
					array.push(entry);
				}
				else
				{
					this.buckets[hash] = [entry];
				}
				this.count++;
				this.entryList.addLast(entry);
			},

			get: function (key)
			{
				var compareKey = this.compareSelector(key);
				var hash = ComputeHashCode(compareKey);
				if (!HasOwnProperty(this.buckets, hash)) return undefined;

				var array = this.buckets[hash];
				for (var i = 0; i < array.length; i++)
				{
					var entry = array[i];
					if (this.compareSelector(entry.key) === compareKey) return entry.value;
				}
				return undefined;
			},

			set: function (key, value)
			{
				var compareKey = this.compareSelector(key);
				var hash = ComputeHashCode(compareKey);
				if (HasOwnProperty(this.buckets, hash))
				{
					var array = this.buckets[hash];
					for (var i = 0; i < array.length; i++)
					{
						if (this.compareSelector(array[i].key) === compareKey)
						{
							var newEntry = new HashEntry(key, value);
							this.entryList.replace(array[i], newEntry);
							array[i] = newEntry;
							return true;
						}
					}
				}
				return false;
			},

			contains: function (key)
			{
				var compareKey = this.compareSelector(key);
				var hash = ComputeHashCode(compareKey);
				if (!HasOwnProperty(this.buckets, hash)) return false;

				var array = this.buckets[hash];
				for (var i = 0; i < array.length; i++)
				{
					if (this.compareSelector(array[i].key) === compareKey) return true;
				}
				return false;
			},

			clear: function ()
			{
				this.count = 0;
				this.buckets = {};
				this.entryList = new EntryList();
			},

			remove: function (key)
			{
				var compareKey = this.compareSelector(key);
				var hash = ComputeHashCode(compareKey);
				if (!HasOwnProperty(this.buckets, hash)) return;

				var array = this.buckets[hash];
				for (var i = 0; i < array.length; i++)
				{
					if (this.compareSelector(array[i].key) === compareKey)
					{
						this.entryList.remove(array[i]);
						array.splice(i, 1);
						if (array.length == 0) delete this.buckets[hash];
						this.count--;
						return;
					}
				}
			},

			count: function ()
			{
				return this.count;
			},

			toEnumerable: function ()
			{
				var self = this;
				return new Enumerable(function ()
				{
					var currentEntry;

					return new IEnumerator(
						function () { currentEntry = self.entryList.first },
						function ()
						{
							if (currentEntry != null)
							{
								var result = { key: currentEntry.key, value: currentEntry.value };
								currentEntry = currentEntry.next;
								return this.yield(result);
							}
							return false;
						},
						Functions.Blank);
				});
			}
		};

		return Dictionary;
	})();

	// dictionary = Dictionary<TKey, TValue[]>
	var Lookup = function (dictionary)
	{
		this.count = function ()
		{
			return dictionary.count();
		};

		this.get = function (key)
		{
			return Enumerable.from(dictionary.get(key));
		};

		this.contains = function (key)
		{
			return dictionary.contains(key);
		};

		this.toEnumerable = function ()
		{
			return dictionary.toEnumerable().select(function (kvp)
			{
				return new Grouping(kvp.key, kvp.value);
			});
		};
	};

	var Grouping = function (key, elements)
	{
		this.key = function ()
		{
			return key;
		};

		ArrayEnumerable.call(this, elements);
	};
	Grouping.prototype = new ArrayEnumerable();

	// out to global
	return Enumerable;
})();

if (typeof jQuery != "undefined")
{
	jQuery.extend({ Enumerable: Enumerable });
	jQuery.fn.toEnumerable = function ()
	{
			return Enumerable.from(this).select(function (e) { return $(e) });
	};
	jQuery.fn.tojQuery = function ()
	{
			return $(this.toArray());
	};
}
