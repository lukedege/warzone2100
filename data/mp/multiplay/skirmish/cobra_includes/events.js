//This file contains generic events. Chat and research events are split into
//their own seperate files.

function eventGameInit()
{
	initCobraGroups();
}

//Setup timers mostly
function eventStartLevel()
{
	initCobraVars();
	recycleForHover();
	buildOrders(); //Start building right away.

	//That (me * 100) part is to help reduce multiple Cobra AI's from coinciding stuff on the same frame. Of course,
	//higher "me"s may impact the bot in some, hopefully, minimal manner.
	var delay = me * 100;
	//Make Cobra think "slower" on easy difficulty for some of its basic functions
	var easyTimeDelay = (difficulty === EASY) ? 5000 : 0;

	setTimer("buildOrders", 300 + delay + (2 * easyTimeDelay));
	setTimer("produce", 400 + delay + easyTimeDelay);
	setTimer("retreatTactics", 500 + delay);
	setTimer("checkAllForRepair", 600 + delay + (4 * easyTimeDelay));
	setTimer("research", 800 + delay + (3 * easyTimeDelay));
	setTimer("lookForOil", 1000 + delay + (2 * easyTimeDelay));
	setTimer("repairDroidTactics", 1200 + delay);
	setTimer("artilleryTactics", 1400 + delay);
	setTimer("vtolTactics", 1600 + delay);
	setTimer("groundTactics", 2000 + delay);
	setTimer("switchOffMG", 5000 + delay);
	setTimer("recycleForHover", 8000 + delay);
	setTimer("checkIfDead", 9000 + delay);
}

//This is meant to check for nearby oil resources next to the construct. also
//defend our derrick if possible.
function eventStructureBuilt(structure, droid)
{
	if (structure.stattype === RESOURCE_EXTRACTOR && droid)
	{
		var nearbyOils = enumRange(droid.x, droid.y, 8, ALL_PLAYERS, false);
		nearbyOils = nearbyOils.filter(function(obj) {
			return (obj.type === FEATURE) && (obj.stattype === OIL_RESOURCE);
		});
		nearbyOils = nearbyOils.sort(distanceToBase);
		droid.busy = false;

		if (nearbyOils.length > 0)
		{
			orderDroidBuild(droid, DORDER_BUILD, structures.derricks, nearbyOils[0].x, nearbyOils[0].y);
		}
		else if (!highOilMap())
		{
			var numDefenses = enumRange(droid.x, droid.y, 3, me, false).filter(function(obj) {
				return (allianceExistsBetween(me, obj.player) && (obj.type === STRUCTURE) && (obj.stattype === DEFENSE));
			});

			if (numDefenses === 0)
			{
				buildDefenses(droid, true);
			}
		}
	}
}

//Make droids attack hidden close by enemy object.
function eventDroidIdle(droid)
{
	if (shouldCobraAttack() && (droid.droidType === DROID_WEAPON || droid.droidType === DROID_CYBORG || isVTOL(droid)))
	{
		var enemyObjects = enumRange(droid.x, droid.y, 6, ENEMIES, false);
		if (enemyObjects.length > 0)
		{
			enemyObjects = enemyObjects.sort(distanceToBase);
			attackThisObject(droid.id, objectInformation(enemyObjects[0]));
		}
	}
}

//Groups droid types.
function eventDroidBuilt(droid, struct)
{
	if (isConstruct(droid.id))
	{
		var isEngineer = droid.body === "CyborgLightBody";

		if (!isEngineer && baseType === CAMP_CLEAN && getMultiTechLevel() > 1 && enumGroup(oilGrabberGroup).length === 0)
		{
			groupAdd(oilGrabberGroup, droid); //Fix for crazy T2/T3/T4 no-bases config
		}
		else if (enumGroup(constructGroup).length < MIN_TRUCKS_PER_GROUP)
		{
			groupAdd(constructGroup, droid);
		}
		else if (!isEngineer && (enumGroup(oilGrabberGroup).length < MIN_TRUCKS_PER_GROUP))
		{
			groupAdd(oilGrabberGroup, droid);
		}
		else if (highOilMap() && (enumGroup(constructGroupNTWExtra).length < MIN_TRUCKS_PER_GROUP))
		{
			groupAdd(constructGroupNTWExtra, droid);
		}
		else
		{
			groupAdd(constructGroup, droid);
		}
	}
	else if (droid.droidType === DROID_SENSOR)
	{
		groupAdd(sensorGroup, droid);
	}
	else if (droid.droidType === DROID_REPAIR)
	{
		groupAdd(repairGroup, droid);
	}
	else if (isVTOL(droid))
	{
		groupAdd(vtolGroup, droid);
	}
	else if (droid.droidType === DROID_WEAPON || droid.droidType === DROID_CYBORG)
	{
		//Anything with splash damage or CB abiliities go here.
		if (droid.isCB || droid.hasIndirect)
		{
			groupAdd(artilleryGroup, droid);
		}
		else
		{
			groupAdd(attackGroup, droid);
		}
	}
}

function eventAttacked(victim, attacker)
{
	if ((attacker === null) || (victim === null) || (victim.player !== me) || allianceExistsBetween(attacker.player, victim.player))
	{
		return;
	}

	const GROUP_SCAN_RADIUS = 8;
	var nearbyUnits = enumRange(victim.x, victim.y, GROUP_SCAN_RADIUS, ALLIES, false).filter(function(obj) {
		return obj.type === DROID;
	});

	//Custom SemperFi-JS's localized regrouping code to be used to retreat away from highly outnumbered contests.
	if (victim.type === DROID && victim.player === me)
	{
		if (isVTOL(victim))
		{
			droidReady(victim.id);
		}
		else if (victim.order !== DORDER_RTR &&
			victim.order !== DORDER_RECYCLE &&
			!repairDroid(victim.id) &&
			nearbyUnits.length < enumRange(victim.x, victim.y, GROUP_SCAN_RADIUS, ENEMIES, false).length)
		{
			orderDroidLoc(victim, DORDER_MOVE, MY_BASE.x, MY_BASE.y); //Move now
			groupAdd(retreatGroup, victim);
		}
	}

	if (isDefined(scavengerPlayer) && (attacker.player === scavengerPlayer))
	{
		lastAttackedByScavs = gameTime;
		return;
	}

	if (attacker.player !== me && !allianceExistsBetween(attacker.player, victim.player))
	{
		if (grudgeCount[attacker.player] < MAX_GRUDGE)
		{
			grudgeCount[attacker.player] += (victim.type === STRUCTURE) ? 20 : 5;
		}

		//Check if a droid needs repair.
		if ((victim.type === DROID) && !isVTOL(victim) && countStruct(structures.extras[0]))
		{
			repairDroid(victim.id);
		}

		if (stopExecution("throttleEventAttacked1", 1000))
		{
			return;
		}

		var units = nearbyUnits.filter(function(dr) {
			return (dr.id !== victim.id &&
				dr.group !== retreatGroup &&
				((isVTOL(dr) && droidReady(dr.id)) ||
				(!repairDroid(dr.id)) && droidCanReach(dr, attacker.x, attacker.y))
			);
		});

		const UNIT_LEN = units.length;

		if (UNIT_LEN >= MIN_ATTACK_DROIDS && shouldCobraAttack())
		{
			for (var i = 0; i < UNIT_LEN; i++)
			{
				if ((subPersonalities[personality].resPath === "offensive") || (random(100) < 33))
				{
					if (distBetweenTwoPoints(victim.x, victim.y, attacker.x, attacker.y) < (GROUP_SCAN_RADIUS + 4))
					{
						orderDroidObj(units[i], DORDER_ATTACK, attacker);
					}
					else
					{
						orderDroidLoc(units[i], DORDER_SCOUT, attacker.x, attacker.y);
					}
				}
			}
		}
	}
}

function eventObjectTransfer(obj, from)
{
	if (from !== me)
	{
		if (allianceExistsBetween(from, me) || ((from === obj.player) && !allianceExistsBetween(obj.player, me)))
		{
			if (obj.type === DROID)
			{
				eventDroidBuilt(obj, null);
			}
		}
	}
}

//Basic Laser Satellite support.
function eventStructureReady(structure)
{
	if (!structure)
	{
		const LASER = enumStruct(me, structures.extras[2]);
		if (LASER.length > 0)
		{
			structure = LASER[0];
		}
		else
		{
			queue("eventStructureReady", 10000);
			return;
		}
	}

	var fac = returnClosestEnemyFactory();
	if (fac)
	{
		activateStructure(structure, getObject(fac.typeInfo, fac.playerInfo, fac.idInfo));
	}
	else
	{
		queue("eventStructureReady", 10000, structure);
	}
}
