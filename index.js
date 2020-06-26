//FIXED
var WebSocketServer = require("ws").Server
const http = require("http");
const app = require("express")();
var express = require("express");
const PORT = process.env.PORT || 9091;

app.use('/public', express.static('public'));
app.get("/", (req,res)=> res.sendFile(__dirname + "/index.html"))


var server = http.createServer(app);
server.listen(PORT);
console.log("Server listening on %d", PORT);
var wsServer = new WebSocketServer({
    server: server
})

//FIXED

const {Client} = require('pg');
const database = new Client({
    user: process.env.DATABASE_USER || 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    database: process.env.DATABASE_NAME || 'newsql',
    password: process.env.DATABASE_PASSWORD || '123456',
    port: process.env.DATABASE_PORT || 5432 
});

////console.log(database);
database.connect((err, client) =>{
    if(err){
        return console.log("ERROR acquiring client",err.stack);
    }
    else{
        console.log("Connetion succes!");
    }

});

var bcrypt = require('bcrypt');
const clients = {};
var clientsSearch = [];
const games = {};

class Player{
    constructor(id, connection){
        this.id = id;
        this.connection = connection;
        this.gameID = 0;
        this.readyToGame = false;
        console.log(id + " - подключился");
        const payLoad = {
            "method": "connect",
            "clientId": id
        }
        connection.send(JSON.stringify(payLoad));
        this.login = "Гость";
    }
    setReady(status){
        this.readyToGame = status;
    }
    setGameID(gameID){
        this.gameID = gameID;
    }
    setOpponentID(newOpponentID){
        this.opponentID = newOpponentID;
    }
    setMap(newMap){
        this.map = newMap;
    }
    register(info){
        var plr = this;

        var salt = bcrypt.genSaltSync(10);
        var pass = bcrypt.hashSync(info.pass, salt);
        

        database.query('INSERT INTO users(login, password, salt) VALUES($1, $2, $3) RETURNING *', [info.login, pass, salt] , 
        (err, res) => {
            if (err) {
              //console.log(err.stack)
              //console.log("REGISTRATON ERROR!");
                const payLoad = {
                    "method": "resultRegister",
                    "res": "error",
                    "login": info.login
                }
                plr.connection.send(JSON.stringify(payLoad));
            } else {
                //console.log(res.rows[0])
                //console.log("REGISTRATON");
                plr.setLogin(info.login);
            
                const payLoad = {
                    "method": "resultRegister",
                    "res": "success",
                    "login": info.login
                }
                plr.connection.send(JSON.stringify(payLoad));
                }
          })
    }
    auth(info){
        var plr = this;

        //console.log(info);
        
        database.query("SELECT login,password,salt FROM users WHERE login = $1", [info.login], 
        (err, data) => {
            if (err) {
                //console.log(err.stack)
               
            }
            else {
                var res = data.rows[0]
                //console.log(res);

                if(data.rows.length > 0 ){
                    var salt = res.salt;
                    var userPass = bcrypt.hashSync(info.pass, salt);
                    if (res.password != userPass){
                        const payLoad = {
                            "method": "resultAuth",
                            "res": "password_error",
                            "login": info.login
                        }
                        plr.connection.send(JSON.stringify(payLoad));
                        
                    }
                    else{
                        plr.setLogin(info.login);
                        const payLoad = {
                            "method": "resultAuth",
                            "res": "success",
                            "login": info.login
                        }
                        plr.connection.send(JSON.stringify(payLoad));
                    
                    }
                }
                else {
                    const payLoad = {
                        "method": "resultAuth",
                        "res": "LoginNotFound",
                        "login": info.login
                    }
                    plr.connection.send(JSON.stringify(payLoad));
                  
                }
            }
        });
      
    }
    setLogin(login){
        this.login = login;
    }
    loginOut(){
        this.login = "Гость";
    }
}

    //STAGE 1

class Game{
    constructor([id1, id2], gameID){
        this.gamers = [];
        this.id = gameID;

        this.gamers[0] = clients[id1];
        this.gamers[0].setOpponentID(id2);
        

        this.gamers[1] = clients[id2];
        this.gamers[1].setOpponentID(id1);
        
        
        this.gamers[0].setGameID(gameID);
        this.gamers[1].setGameID(gameID);

        this.valueChangeTurn = 0;
        
        this.turn = (Math.floor(Math.random() * (10)))%2;
       
        //console.log("создана игра - " +  this.id);
        for (let i = 0; i <= 1; i++){
            var payLoad = {
                "method": "setOpponent",
                "clientID":  this.gamers[i].id,
                "opponentID": this.gamers[i].opponentID,
                "opponentLogin": this.gamers[(i+1)%2].login ,
                "gameID":  this.id
            }
            this.send(this.gamers[i], payLoad);
        }
        this.setTurn();
        this.startInterval();
    }
    startInterval(){
        this.valueChangeTurn++;
        //console.log("старт интервал");
        this.changeTurn = setInterval(() => {
            this.turn = (this.turn + 1) % 2;
            //console.log("смена хода");
            this.setTurn();
        }, 10000);
    }
    send(client, message){
        try{
            //console.log("клиенту - " + client.id + " отправлено сообщениие: " + message.method);
            client.connection.send(JSON.stringify(message));
        }
        catch(error){
            //console.log(error);
            clearInterval(this.changeTurn);
        }
       
    }
    shoot(result){
        clearInterval(this.changeTurn);
        //console.log("интервал сброшен");
        for (let i = 0; i <= 1; i++){
            ////console.log(result.clientID+" == "+this.gamers[i].id)
            if (result.clientID == this.gamers[i].id){
                ////console.log(this.gamers[i]);
                this.send(this.gamers[(i + 1) % 2], result);
            }
        }
    }
    resultShoot(result){
        for (let i = 0; i <= 1; i++){
            if (result.clientID == this.gamers[i].id){
                this.send(this.gamers[(i + 1) % 2], result);
            }
        }
        var cell = result.res.cell;
        //console.log(cell + " - ответ игрока " + result.clientID);
        switch(cell){
            case 0:
                this.turn = (this.turn+1)%2;
                this.setTurn();
                this.startInterval();
                break;
            case 1:
                this.setTurn();
                this.startInterval();
                break;
            case 4:
                var winner = result.opponentID;
                this.endGame("defeat", winner);
                break;
            case 5:
                this.setTurn();
                this.startInterval();
                break;
            default:
                break;
        }
    }
    setTurn(){
        for (let i = 0; i <= 1; i++){
            var payLoad = {
                "method": "setTurn",
                "gameID":  this.id,
                "turn": this.gamers[this.turn].id
            }
            this.send(this.gamers[i], payLoad);
        }
    }
    disconnectGame(disconnectID){
        clearInterval(this.changeTurn);
        for (let i = 0; i <= 1; i++){
            if (disconnectID != this.gamers[i].id){
                var payLoad = {
                    "method": "disconnect",
                    "clientID":  this.gamers[i].id,
                    "gameID":  this.id,
                    "opponentArr": this.gamers[(i+1)%2].map
                }
                
                this.send(this.gamers[i], payLoad);
            }
            this.gamers[i].setGameID(0);
            this.gamers[i].setOpponentID(0);
        }
        deleteGame(this.id);
    }
    endGame(reason, winner){
        clearInterval(this.changeTurn);
        for (let i = 0; i <= 1; i++){
            var payLoad = {
                "method": "endGame",
                "reason": reason,
                "winner": winner,
                "gameID":  this.id,
                "opponentMap": this.gamers[(i+1)%2].map
            }
            this.gamers[i].setGameID(0);
            this.gamers[i].setOpponentID(0);
            this.send(this.gamers[i], payLoad);
        }
        deleteGame(this.id);
    }
    capitulateGame(ID){
        clearInterval(this.changeTurn);
        for (let i = 0; i <= 1; i++){
            if (ID != this.gamers[i].id){
                var payLoad = {
                    "method": "capitulate",
                    "clientID":  this.gamers[i].id,
                    "gameID":  this.id,
                    "opponentArr": this.gamers[(i+1)%2].map
                }
                
                this.send(this.gamers[i], payLoad);
            }
            this.gamers[i].setGameID(0);
            this.gamers[i].setOpponentID(0);
        }
        deleteGame(this.id);
    }
}

function deleteGame(id){
    delete games[id];
}

function createGame(gamers){
    try{
       if ( clients[gamers[0]].readyToGame == false ||
            clients[gamers[1]].readyToGame == false ){
            return;
        }
        var gameID = guid();
        var game = new Game(gamers, gameID);
        games[game.id] = game; 
    }
    catch (error){
        //console.log(error);
    }
}

function disconnect(clientID){
    var gameID = clients[clientID].gameID;
    if (gameID != 0){
        //console.log("игра:" + gameID+ " удалена");
        games[gameID].disconnectGame(clientID);
    }

    cancelSearchOpponent(clientID);
    delete clients[clientID];
}

function cancelSearchOpponent(clientID){
    try{
        for (var i = 0; i < clientsSearch.length; i++){
            if (clientsSearch[i] == clientID){
                clientsSearch.splice(i, 1);
                
            }
        }
    }
    catch(error){
        //console.log(error);
        //console.log(clientsSearch);
    }
}

function capitulate(clientID){
    var gameID = clients[clientID].gameID;
    if (gameID != 0){
        games[gameID].capitulateGame(clientID);
    }
    else {
        //console.log("aaaaaa");
    }
}


function sendInvite(response){
    try{
        for (let id in clients) {
            if (clients[id].login == response.opponent_login){
                 const payLoad = {
                     "method": "invite",
                     "clientID":  response.clientID,
                     "login": response.login
                 }
                 sendMessage(clients[id], payLoad);
                 return;
            }
         }
         const payLoad = {
             "method": "result_send_invite",
             "result": "fail",
             "message": "Не удалось отправить приглашение"
         }
         sendMessage(clients[response.clientID], payLoad);
    }
    catch(error){
        //console.log(error);
        const payLoad = {
            "method": "result_send_invite",
            "result": "fail",
            "message": "Не удалось отправить приглашение"
        }
        sendMessage(clients[response.clientID], payLoad);
    }


}

function resultSendInvite(response){
    try{
        const payLoad = {
            "method": "result_send_invite",
            "result": response.result,
            "clientID":  response.clientID,
            "message": response.message,
            "login": response.login
        }
        sendMessage(clients[response.opponentID], payLoad);
    }
    catch(error){
        //console.log(error);
    }
}

function cancelSendInvite(response){
    try{
        const payLoad = {
            "method": "cancel_send_invite",
            "clientID":  response.clientID,
            "login": response.login
        }
        sendMessage(clients[response.opponentID], payLoad);
    }
    catch(error){
        //console.log(error);
    }
}

function sendMessage(plr, msg){
    try{
        plr.connection.send(JSON.stringify(msg));
    }
    catch (err){
        //console.log(err);
    }
}

/*var WebSocketServer = require("ws").Server;
var WebSocketPort = process.env.PORT2 || 9090;
var server = http.createServer(app);
server.listen(WebSocketPort);
//console.log("http server listening on %d", WebSocketPort);
var wsServer = new WebSocketServer({server: server});
*/

/*
FIXED
*/

wsServer.on('connection', function(connection) {
    
    const clientId = guid();
    clients[clientId] = new Player(clientId, connection);

 

    connection.on("close", function(){
        //console.log("Отключился! - " + clientId);
        disconnect(clientId)
    });

    connection.on("message", function(message) {
       
        const result = JSON.parse(message);
     
        switch (result.method){
            case "shoot":
                try{
                    games[result.gameID].shoot(result);
                }    
                catch(error){
                    //console.log(error);
                }
                break;
            case "resultShoot":
                try{
                    games[result.gameID].resultShoot(result);
                }    
                catch(error){
                    //console.log(error);
                }
                break;
            case "searchOpponent":
                try{
                    clients[result.clientID].setMap(result.mapArr);
                
                    if (clientsSearch.length == 0){
                       clientsSearch.push(result.clientID);
                    }
                    else {
                       //console.log(result.clientID+ " нашел оппонента");
                       createGame([result.clientID,clientsSearch[0]]);
                       clientsSearch = [];
                    }
                    //console.log(clientsSearch);
                }    
                catch(error){
                    //console.log(error);
                }             
                break;
            case "cancelSearchOpponent":
                cancelSearchOpponent(result.clientID);
                break;
            case "capitulate":
                capitulate(result.clientID);
                break;
            case "register":
                try{
                    clients[result.clientID].register(result);
                }    
                catch(error){
                    //console.log(error);
                }
                break;
            case "authorization":
                try{
                    clients[result.clientID].auth(result);
                }    
                catch(error){
                    //console.log(error);
                }
                break;
            case "login_out":
                try{
                    clients[result.clientID].loginOut();
                }    
                catch(error){
                    //console.log(error);
                }
            break;
            case "setReady":
                try{
                    clients[result.clientID].setReady(result.ready);
                }    
                catch(error){
                    //console.log(error);
                }
            break;
            case "send_invite":
                sendInvite(result);
                break;
            case "result_send_invite":
                resultSendInvite(result);
                break;
            case "cancel_send_invite":
                cancelSendInvite(result);
            break;
            case "createGame":
                createGame([result.clientID,result.opponentID]);
                break;
            case "checkConnect":
                console.log(clientId + " в сети");
                break;
            default:
                //console.log("Неизвестный метод");
                break;
        }
        
    })

    
    
});


function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}

const guid = () => (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();