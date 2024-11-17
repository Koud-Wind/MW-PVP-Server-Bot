// - 加载模块
let cluster = require('cluster');
let readline = require('readline');

let mineFlayer = require("mineflayer");
let autoVersionForge = require('minecraft-protocol-forge').autoVersionForge;
let mineFlayerViewer = require('prismarine-viewer').mineflayer

let { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
let pvp = require('mineflayer-pvp').plugin;

let botMap = {};

// - 服务器配置
let viewServer, connectTime = 10 * 1000;
let host = "127.0.0.1";
let port = 49999;
let nameList = ["1", "2", "3", "4", "5"];


// 多实例运行
if (cluster.isMaster) {
    for (const name of nameList) {
        const worker = cluster.fork();
        botMap[name] = worker;
        worker.send(name);
    }
    cluster.on('message', (worker, bot) => {
        botList.push(bot);
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on('line', msg => {
        sendCommand(msg);
    });
} else {
    let bot, name;
    process.on('message', msg => {
        if (bot == null) {
            name = msg;
            bot = offlineConnect(host, port, msg);
            return;
        }
        botCommand(bot, msg);
    });
}

function loadPlugin(bot) {
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    return bot;
}

function loadEvent(bot) {
    bot.setMaxListeners(99);

    // 加入后操作
    bot.on('login', ()=> {
        bot.chat("hi");
        bot.chat("/trigger 个人-中途加入 set 1");
        bot.chat("/trigger PC-Join set 1");

        bot.pvp.attackRange = 3;
        bot.pvp.wasInRange = true;
        bot.pvp.followRange = 1;

// - 网页地图

        //mineFlayerViewer(bot, { firstPerson: true, port: 50001 });
        //viewServer = bot.viewer;
        //bot.on('path_update', (r) => {
        //    const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2)
        //    //console.log(`I can get there in ${r.path.length} moves. Computation took ${r.time.toFixed(2)} ms (${nodesPerTick} nodes/tick). ${r.status}`)
        //    const path = [bot.entity.position.offset(0, 0.5, 0)]
        //    for (const node of r.path) {
        //        path.push({ x: node.x, y: node.y + 0.5, z: node.z })
        //    }
        //    bot.viewer.drawLine('path', path, 0xff00ff)
        //})

        //const mcData = require('minecraft-data')(bot.version);
        //const defaultMove = new Movements(bot, mcData);
        //bot.viewer.on('blockClicked', (block, face, button) => {
        //    if (button !== 2) return; // only right click
        //    const p = block.position.offset(0, 1, 0);
        //    bot.pathfinder.setMovements(defaultMove)
        //    bot.pathfinder.setGoal(new goals(p.x, p.y, p.z))
        //});
    });

    bot.on('playerLeft', () => bot.chat(":("));

// - 日志模块

    const regex = /滚出去(\d*)/;
    bot.on('message', (msg, position) => {
        log(`[${bot.username}]: ${msg.toString()}`);

        if (regex.test(msg.toString())) {
            const time = regex.exec(msg.toString())[1];
            if (time != null) {
                if (time > 10 && time <= 600)
                    connectTime = time * 1000;
                else if (time > 0 && time <= 10)
                    connectTime = time * 60 * 1000;
            }
            bot.chat("OK");
            bot.quit();
        }
    });

    bot.on('kicked', msg => {
        log(`| ${msg.translate}`);
    });
    bot.on('error', msg => {
        log(`| ${msg}`);

    });
    bot.on('end', msg => {
        log(`| ${msg}`);
        log(`| Waiting for reconnection...`);
        if (viewServer != null)
            viewServer.close();
        setTimeout(() => {
            bot = offlineConnect(host, port, bot.username);
            connectTime = 10 * 1000;
        }, connectTime);
    });

// - pvp模块

    // 距离缓存
    let mapper = {};
    let tick = 0;

    bot.on('physicsTick', () => {
        // 1次/秒刷新, 无敌时不攻击
        if (++tick % 30 !== 0) {
            return;
        }

        // 非冒险与无敌时停用攻击
        if (bot.player.entity.effects['11'] != null || bot.player.gamemode !== 2 || bot.username === "1") {
            bot.pvp.stop();
            return;
        }

        bot.entity.attributes['generic.movementSpeed'].value = 0.12;

        // 计算全部玩家距离
        const players = bot.players;
        const botTeam = bot.teamMap[bot.username];

        for (p in players) {
            // 排除目标
            if (p === bot.username || botTeam == null || (botTeam.membersMap[p] != null && (botTeam.team !== "CTT" || p.length < 2)))
                continue;

            // 存在玩家则计算距离
            if (players[p].entity != null)
                mapper[p] = euclideanDistance(bot.entity.position, players[p].entity.position);
            else
                delete mapper[p];
        }

        // 取最近的目标
        const minKey = Object.entries(mapper).reduce((min, [key, value]) => {
            return value < mapper[min] ? key : min;
        }, Object.keys(mapper)[0]);


        // 开始攻击
        if (bot.inventory.slots[38] != null)
            bot.equip(bot.inventory.slots[38], "hand");

        if (players[minKey] != null)
            bot.pvp.attack(players[minKey].entity);
    });

    return bot;
}

function offlineConnect(host, port, name) {
    return onlineConnect(host, port, name, null);
}

function onlineConnect(host, port, name, token) {
    const bot = mineFlayer.createBot({
        host,
        port,
        username: name,
        password : token,
        auth: token == null ? 'offline' : 'microsoft',
        version: false,
    });
    bot.username = name;
    autoVersionForge(bot._client);
    loadPlugin(bot);
    loadEvent(bot);
    return bot;
}

function euclideanDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

function log(msg) {
    if (msg == null) {
        process.stdout.write(`> `);
        return;
    }
    //process.stdout.write(`\x1b[K\x1b[1G[${new Date().toLocaleTimeString()}] ${msg}\n> `);
    process.stdout.write(`\x1b[1G\n\x1b[A\x1b[34m[${new Date().toLocaleTimeString()}] \x1b[39m${msg}\n> `);
}

// 命令模块
function split(msg) {
    return /(\S*)\s*(\S*)\s*(.*)/.exec(msg).filter(s => s);
}

function sendCommand(msg) {
    if (!msg.trim()) {
        log();
        return;
    }
    const s = split(msg);
    s[1] = s[1].toLowerCase();
    switch (s[1]) {
        case 'stop':
            process.exit();
    }

    if (s.length < 3) {
        commandHelp(s[1]);
        return;
    }
    if (botMap[s[2]] == null) {
        log(`Not found ${s[2]}!`);
        return;
    }

    botMap[s[2]].send(s);
}

function botCommand(bot, s) {
    switch (s[1]) {
        case 's':
        case 'say':
            if (s.length < 4) {
                commandHelp(s[1]);
                return;
            }
            bot.chat(s[3]);
            break;

        default:
            log("Unknown Command!");
    }
}

function commandHelp(command) {
    switch (command) {
        case 's':
        case 'say':
            log("say <botName> <msg>");
            return;
        default:
            log("Unknown Command!");
    }
}
