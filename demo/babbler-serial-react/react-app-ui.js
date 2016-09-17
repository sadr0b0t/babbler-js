
// bblr-connect.js
var React = require('react');
var ReactDOM = require('react-dom');

import getMuiTheme from 'material-ui/styles/getMuiTheme';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import Paper from 'material-ui/Paper';
import {Tabs, Tab} from 'material-ui/Tabs';
import Divider from 'material-ui/Divider';

import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import keycode from 'keycode';

import FontIcon from 'material-ui/FontIcon';
import {red200, green200} from 'material-ui/styles/colors';

import Subheader from 'material-ui/Subheader';

import BabblerConnectionStatusIcon from '../../react-components/material-ui/BabblerConnectionStatusIcon';
import BabblerConnectionErrorSnackbar from '../../react-components/material-ui/BabblerConnectionErrorSnackbar';
import BabblerConnectionPanel from '../../react-components/material-ui/BabblerConnectionPanel';
import BabblerDataFlow from '../../react-components/material-ui/BabblerDataFlow';

var createFragment = require('react-addons-create-fragment');

const btnStyle = {
  margin: 12
};

var BabblerActions = React.createClass({
// http://www.material-ui.com/#/components/raised-button
// http://www.material-ui.com/#/components/text-field
// https://github.com/callemall/material-ui/blob/v0.15.4/src/TextField/TextField.js#L367
// http://www.material-ui.com/#/components/subheader

    getInitialState: function() {
        return {
            deviceStatus: this.props.babblerDevice.deviceStatus(),
            cmdValue: ""
        };
    },
    
    componentDidMount: function() {
        // слушаем статус устройства
        this.babblerDeviceListener = function onStatusChange(status) {
            this.setState({deviceStatus: status});
        }.bind(this);
        this.props.babblerDevice.addOnStatusChangeListener(this.babblerDeviceListener);
    },
    
    componentWillUnmount: function() {
        // почистим слушателей
        this.props.babblerDevice.removeOnStatusChangeListener(this.babblerDeviceListener);
    },
    
    handleCmdChange: function(event) {
        this.setState({
          cmdValue: event.target.value,
        });
    },
    
    handleCmdKeyDown: function(event) {
        // https://github.com/callemall/material-ui/blob/v0.15.4/src/TextField/TextField.js#L367
        //console.log(event.keyCode);
        //if(event.keyCode === 13) {
        if(this.state.cmdValue.length > 0 && keycode(event) === 'enter') {
            this.execCmd();
        }
    },
    
    render: function() {
        var connected = this.state.deviceStatus === BBLR_STATUS_CONNECTED ? true : false;
        return (
            <div style={{overflowY: "auto", height: 500}}>
                <div>
                    <TextField 
                        hintText="cmd [params]" 
                        value={this.state.cmdValue} 
                        onChange={this.handleCmdChange} 
                        onKeyDown={this.handleCmdKeyDown} 
                        disabled={!connected} 
                        fullWidth={true} />
                    <RaisedButton 
                        label="Выполнить" 
                        onClick={this.execCmd} 
                        disabled={!connected || this.state.cmdValue.length == 0} 
                        style={btnStyle} />
                    <RaisedButton label="ping" onClick={this.cmdPing} disabled={!connected} style={btnStyle} />
                    <RaisedButton label="help" onClick={this.cmdHelp} disabled={!connected} style={btnStyle} />
                </div>
                <Subheader>Команда</Subheader>
                <div style={{minHeight: 26, fontSize: 24, marginLeft: 45}}>{this.state.currCmd}</div>
                <Subheader>Ответ</Subheader>
                <div style={{minHeight: 26, fontSize: 24, marginLeft: 45}}>{this.state.reply}</div>
                <Subheader>Ошибка</Subheader>
                <div style={{minHeight: 18, marginLeft: 45, color: red200}}>{this.state.error}</div>
                <Subheader>Данные</Subheader>
                <BabblerDataFlow
                    babblerDevice={this.props.babblerDevice}
                    maxItems={100}
                    reverseOrder={true}
                    timestamp={true}
                    style={{margin: 20}}/>
            </div>
        );
    },
    
    execCmd: function() {
        var cmdParts = this.state.cmdValue.split(" ");
        // первый кусок - имя команды
        var cmd = cmdParts[0];
        // все остальное - параметры
        cmdParts.shift();
        var params = cmdParts;
        
        this.props.babblerDevice.sendCmd(cmd, params,
            // onReply
            function(cmd, id, reply) {
                this.setState({reply: reply, error: undefined});
            }.bind(this),
            // onError
            function(cmd, msg) {
               this.setState({reply: "-", error: msg});
            }.bind(this)
        );
        this.setState({
            cmdValue: "", 
            currCmd: this.state.cmdValue,
            reply: "",
            error: ""
        });
    }, 
    
    cmdPing: function() {
          this.props.babblerDevice.sendCmd("ping", [],
              // onReply
              function(cmd, id, reply) {
                  this.setState({reply: reply, error: undefined});
              }.bind(this),
              // onError
              function(cmd, msg) {
                 this.setState({reply: "-", error: msg});
              }.bind(this)
          );
          this.setState({
              currCmd: "ping",
              reply: "",
              error: ""
          });
      },
      
      cmdHelp: function() {
          this.props.babblerDevice.sendCmd("help", ["--list"],
              // onReply
              function(cmd, id, reply) {
                  this.setState({reply: reply, error: undefined});
              }.bind(this),
              // onError
              function(cmd, msg) {
                 this.setState({reply: "-", error: msg});
              }.bind(this)
          );
          this.setState({
              currCmd: "help --list",
              reply: "",
              error: ""
          });
      }
});

var BabblerActionsLeds = React.createClass({
// http://www.material-ui.com/#/components/raised-button
// http://www.material-ui.com/#/components/subheader

    getInitialState: function() {
        return {
            deviceStatus: this.props.babblerDevice.deviceStatus(),
            ledOn: false
        };
    },
    
    componentDidMount: function() {
        // слушаем статус устройства
        this.babblerDeviceListener = function onStatusChange(status) {
            this.setState({deviceStatus: status});
        }.bind(this);
        this.props.babblerDevice.addOnStatusChangeListener(this.babblerDeviceListener);
    },
    
    componentWillUnmount: function() {
        // почистим слушателей
        this.props.babblerDevice.removeOnStatusChangeListener(this.babblerDeviceListener);
    },
    
    render: function() {
        var connected = this.state.deviceStatus === BBLR_STATUS_CONNECTED ? true : false;
        return (
            <div style={{textAlign: "center"}}>
                <div>
                    <RaisedButton label="Включить лампочку" onClick={this.cmdLedon} disabled={!connected} style={btnStyle} />
                    <RaisedButton label="Выключить лампочку" onClick={this.cmdLedoff} disabled={!connected} style={btnStyle} />
                </div>
                
                <FontIcon 
                    className="material-icons" 
                    style={{fontSize: 160, marginTop: 40}}
                    color={(this.state.ledOn ? green200 : red200)}
                >{(this.state.ledOn ? "sentiment_very_satisfied" : "sentiment_very_dissatisfied")}</FontIcon>
                     
            </div>
        );
    },
    
    cmdLedon: function() {
          this.props.babblerDevice.sendCmd("ledon", [],
              // onReply
              function(cmd, id, reply) {
                  this.setState({ledOn: true, reply: reply});
              }.bind(this),
              // onError
              function(cmd, msg) {
                  console.log(cmd + ": " + msg);
              }.bind(this)
          );
      }, 
      
      cmdLedoff: function() {
          this.props.babblerDevice.sendCmd("ledoff", [],
              // onReply
              function(cmd, id, reply) {
                  this.setState({ledOn: false, reply: reply});
              }.bind(this),
              // onError
              function(cmd, msg) {
                  console.log(cmd + ": " + msg);
              }.bind(this)
          );
      }
});

var babblerDevice1 = new BabblerDevice();


ReactDOM.render(
    <MuiThemeProvider muiTheme={getMuiTheme()}>
      <div>
        <Paper>
            <BabblerConnectionPanel babblerDevice={babblerDevice1}/>
            <BabblerConnectionStatusIcon 
                babblerDevice={babblerDevice1} 
                iconSize={50}
                style={{position: "absolute", right: 0, marginRight: 14, marginTop: 5}} />
        </Paper>
        
        <Divider style={{marginTop: 20, marginBottom: 20}}/>
        
        <Tabs>
            <Tab label="Лампочки" >
                <BabblerActionsLeds babblerDevice={babblerDevice1}/>
            </Tab>
            <Tab label="Отладка" >
                <BabblerActions babblerDevice={babblerDevice1}/>
            </Tab>
            <Tab label="Лог" >
                <BabblerDataFlow 
                    babblerDevice={babblerDevice1} 
                    reverseOrder={true}
                    maxItems={10000}
                    timestamp={true}
//                    filter={{ err: false, data: false }}
//                    filter={{ data: {queue: false} }}
//                    filter={{ err: {in: false, out: false, queue: false}, data: {in: false, out: false, queue: false} }}
                    style={{margin: 20}}/>
            </Tab>
        </Tabs>
        
        <BabblerConnectionErrorSnackbar babblerDevice={babblerDevice1}/>
      </div>
    </MuiThemeProvider>,
    document.getElementById('app-content')
);

