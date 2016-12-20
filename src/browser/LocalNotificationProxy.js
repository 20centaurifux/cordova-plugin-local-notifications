var NotificationHelpers =
{
	wasInThePast: function(n)
	{
		var d = n["triggerDate"];

		return d != null && new Date().getTime() > d.getTime();
	},
	isScheduled: function(n)
	{
		return !NotificationHelpers.wasInThePast(n) && n["timeout"];
	},
	isTriggered: function(n)
	{
		return NotificationHelpers.wasInThePast(n);
	}
};

function NotificationManager()
{
	var notifications = {};

	// test if object has an id and create a random one if test fails:
	var ensureId = function(m)
	{
		if(!m.id)
		{
			m.id = makeUUID();
		}

		return m;
	};

	// test if notification has an active timeout & clear it on success:
	var clearNotificationTimeout = function(notification)
	{
		if(notification["timeout"])
		{
			clearTimeout(notification["timeout"]);
      notification["timeout"] = null;
		}
	};

  // save notification in internal map & clear interval if it already exists:
	var registerNotification = function(type, opts)
	{
		var n = notifications[opts.id];

		if(n)
		{
			clearNotificationTimeout(n);
		}

		notifications[opts.id] =
		{
			"opts": opts,
			"present": false,
			"timeout": null,
			"type": type,
			"triggerDate": null,
			"interval": getIntervalFromOptions(opts)
		};
	};

	// update the notification's "present" flag, remove it from notification center & fire "clear" event:
	var clearNotificationById = function(id, preventDefault)
	{
		var n = notifications[id];

		if(n && n["present"])
		{
			n["present"] = false;

			try
			{
				var obj = n["object"];

				obj.onclose = null;
				obj.close();
			}
			catch(e) { }

			if(!preventDefault)
			{
				cordova.plugins.notification.local.core.fireEvent("clear", n["opts"]);
			}
		}
	};

	// convert plugin options to browser Notification options:
	var makeNotificationOptions = function(opts)
	{
		var opts = opts || {};
		var options = {};

		if(opts.text)
		{
			options.body = opts.text;
		}

		if(opts.icon)
		{
			options.icon = opts.icon;
			options.type = "image";
		}

		if(opts.id)
		{
			options.tag = opts.id;
		}

		if(opts.data)
		{
			options.data = opts.data;
		}

		return options;
	};

	// try to convert the "every" property of the given options to milliseconds:
	var getIntervalFromOptions = function(opts)
	{
		var intervals =
		{
			"second": 1,
			"minute": 60,
			"hour": 60 * 60,
			"day": 24 * 60 * 60,
			"week": 24 * 60 * 60 * 7,
			"month": 24 * 60 * 60 * 30,
			"quarter": 24 * 60 * 60 * 30 * 4,
			"year": 24 * 60 * 60 * 356
		};

		var interval = 0;

		try
		{
			interval = intervals[opts.every.toLowerCase()] * 1000;
		}
		catch(e) { }

		return interval;
	};

	// try to convert the "at" property of the given options to milliseconds:
	var getTimeoutFromOptions = function(opts)
	{
		var ms = 0;

		if(opts.at)
		{
			ms = opts.at * 1000;
			ms -= new Date().getTime();

			if(ms < 1000)
			{
				ms = 0;
			}
		}

		return ms;
	};

	// make & show notification, fire "trigger/schedule" event & reschedule if necessary:
	var makeNotification = function(opts)
	{
		var ms = getTimeoutFromOptions(opts);

		registerNotification(ms ? "triggered" : "scheduled", opts);

		// create notification lambda:
		var f = function()
		{
			// create notification & set "present" flag:
			var notification = notifications[opts.id];

			opts = notification["opts"];

			var notificationOptions = makeNotificationOptions(opts);
			var n = new Notification(opts.title, notificationOptions);

			notification["present"] = true;
			notification["object"] = n;

			var triggered = NotificationHelpers.isTriggered(notification);

			notification["triggerDate"] = new Date();

			// event handler:
			n.onclick = function()
			{
				cordova.plugins.notification.local.core.fireEvent("click", opts);
			}

			n.onclose = function()
			{
				clearNotificationById(opts.id);
			}

			// fire "trigger/schedule" event:
			cordova.plugins.notification.local.core.fireEvent(ms || triggered ? "trigger" : "schedule", opts);

			// update timeout:
			var interval = notification["interval"];

			if(interval)
			{
				notification["timeout"] = setTimeout(f, interval);
			}
			else
			{
				notification["timeout"] = null;
			}
		}

		// run lambda:
		if(ms)
		{
			// show notification in the future => store timeout id:
			notifications[opts.id]["timeout"] = setTimeout(f, ms);
		}
		else
		{
			// no delay => enjoy the show:
			f();
		}
	};

	// make random guid:
	NotificationManager.prototype.makeUUID = function()
	{
		var d = new Date().getTime();

		if(window.performance && typeof window.performance.now === "function")
		{
			d += performance.now();
		}

		var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c)
		{
			var r = (d + Math.random() * 16) % 16 | 0;

			d = Math.floor(d / 16);

			return (c == "x" ? r : (r & 0x3 |0x8)).toString(16);
		});

		return uuid;
	}

	// test browser notification settings & create notification if permission is granted:
	NotificationManager.prototype.notify = function(opts)
	{
		// test notification support:
		if(!window.Notification)
		{
			console.warn("Your browser doesn't support notifications yet.");
			return;
		}

		// test/request permissions:
		if(window.Notification.permission === 'default')
		{
			var notify = arguments.callee;

			window.Notification.requestPermission(function(granted)
			{
				if(granted === "granted")
				{
					notify(opts);
				}
			});
		}
		else if(window.Notification.permission === "granted")
		{
			makeNotification(ensureId(opts));
		}
	}

	// clear notification, reschedule & fire "update" event:
	NotificationManager.prototype.update = function(opts)
	{
		var n = notifications[opts.id];

		if(n)
		{
			clearNotificationTimeout(n);
			clearNotificationById(opts.id, true);

			opts = Object.assign(n["opts"], opts);

			makeNotification(opts);

			cordova.plugins.notification.local.core.fireEvent("update", opts);
		}
	}

	NotificationManager.prototype.clear = function(ids)
	{
		for(var i = 0; i < ids.length; ++i)
		{
			var n = notifications[ids[i]];

			if(n && n["present"])
			{
				n["object"].close();
			}
		}
	}

	NotificationManager.prototype.clearAll = function()
	{
		for(var k in notifications)
		{
			clearNotificationById(k, true);
		}

		cordova.plugins.notification.local.core.fireEvent("clearall");
	}

	NotificationManager.prototype.cancel = function(ids)
	{
		for(var i = 0; i < ids.length; ++i)
		{
			var n = notifications[ids[i]];

			if(n)
			{
				clearNotificationTimeout(n);
				clearNotificationById(ids[i]);

				cordova.plugins.notification.local.core.fireEvent("cancel", n["opts"]);
			}
		}
	}

	NotificationManager.prototype.cancelAll = function()
	{
		for(var k in notifications)
		{
			var n = notifications[k];

			clearNotificationTimeout(n);
			clearNotificationById(k);
		}

		cordova.plugins.notification.local.core.fireEvent("cancelall");
	}

	NotificationManager.prototype.processSingleNotification = function(id, process, success)
	{
		var n = notifications[id];

		if(n && success)
		{
			if(process)
			{
				success(process(n));
			}
			else
			{
				success(n);
			}
		}
	}

	NotificationManager.prototype.select = function(pred, process, success)
	{
		if(success)
		{
			var result = [];

			for(var k in notifications)
			{
				var n = notifications[k];

				if(!pred || pred(n))
				{
					if(process)
					{
						result.push(process(n));
					}
					else
					{
						result.push(n);
					}
				}
			}

			success(result);
		}
	}
};

var manager = new NotificationManager();

var LocalNotification =
{
	schedule: function(success, error, opts)
	{
		for(var i = 0; i < opts.length; i++)
		{
			manager.notify(opts[i]);
		}
	},
	update: function(success, error, opts)
	{
		for(var i = 0; i < opts.length; i++)
		{
			manager.update(opts[i]);
		}
	},
	clear: function(success, error, opts)
	{
		manager.clear(opts);
	},
	clearAll: function(success, error, opts)
	{
		manager.clearAll(opts);

    if(success)
    {
      success();
    }
	},
	cancel: function(success, error, opts)
	{
		manager.cancel(opts);
	},
	cancelAll: function(success, error, opts)
	{
		manager.cancelAll(opts);

    if(success)
    {
      success();
    }
	},
	isPresent: function(success, error, opts)
	{
		manager.processSingleNotification(opts[0], function(n) { return n["present"]; }, success);
	},
  isScheduled: function(success, error, opts)
	{
		manager.processSingleNotification(opts[0], NotificationHelpers.isScheduled, success);
	},
	isTriggered: function(success, error, opts)
	{
		manager.processSingleNotification(opts[0], NotificationHelpers.isTriggered, success);
	},
	getAllIds: function(success, error, opts)
	{
		manager.select(null, function(n) { return n["opts"].id; }, success);
	},
	getScheduledIds: function(success, error, opts)
	{
		if(opts.length > 0)
		{
			manager.select(function(n) { NotificationHelpers.isScheduled(n) && opts.indexOf(n["opts"].id) != -1; },
			               function(n) { return n["opts"].id; },
			               success);
		}
		else
		{
			manager.select(NotificationHelpers.isScheduled, function(n) { return n["opts"].id; }, success);
		}
	},
	getTriggeredIds: function(success, error, opts)
	{
		if(opts.length > 0)
		{
			manager.select(function(n) { return NotificationHelpers.isTriggered(n) && opts.indexOf(n["opts"].id) != -1; },
			               function(n) { return n["opts"].id; },
			               success);
		}
		else
		{
			manager.select(NotificationHelpers.isTriggered, function(n) { return n["opts"].id; }, success);
		}
	},
	getSingle: function(success, error, opts)
	{
		LocalNotification.getAll(function(notifications)
		{
			if(opts.length > 0)
			{
				success(notifications[0]);
			}
		},
		error, opts);
	},
	getSingleScheduled: function(success, error, opts)
	{
		LocalNotification.getScheduled(function(notifications)
		{
			if(opts.length > 0)
			{
				success(notifications[0]);
			}
		},
		error, opts);
	},
	getSingleTriggered: function(success, error, opts)
	{
		LocalNotification.getTriggered(function(notifications)
		{
			if(opts.length > 0)
			{
				success(notifications[0]);
			}
		},
		error, opts);
	},
	getAll: function(success, error, opts)
	{
		if(opts.length > 0)
		{
			manager.select(function(n) { return opts.indexOf(n["opts"].id) != -1 },
			               function(n) { return n["opts"]; },
			               success);
		}
		else
		{
			manager.select(null, function(n) { return n["opts"]; }, success);
		}
	},
	getScheduled: function(success, error, opts)
	{
		if(opts.length > 0)
		{
			manager.select(function(n) { return NotificationHelpers.isScheduled(n) && opts.indexOf(n["opts"].id) != -1 },
			               function(n) { return n["opts"]; },
			               success);
		}
		else
		{
			manager.select(NotificationHelpers.isScheduled,
			               function(n) { return n["opts"]; },
			               success);
		}
	},
	getTriggered: function(success, error, opts)
	{
		if(opts.length > 0)
		{
			manager.select(function(n) { return NotificationHelpers.isTriggered(n) && opts.indexOf(n["opts"].id) != -1 },
			               function(n) { return n["opts"]; },
			               success);
		}
		else
		{
			manager.select(NotificationHelpers.isTriggered,
			               function(n) { return n["opts"]; },
			               success);
		}
	}
};

module.exports = LocalNotification;

require("cordova/exec/proxy").add("LocalNotification", LocalNotification);
