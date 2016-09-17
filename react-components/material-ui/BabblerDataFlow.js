// BabblerDataFlow.js

var React = require('react');

import {red200, lime900, deepPurple900, yellow900} from 'material-ui/styles/colors';

var BabblerDataFlow = React.createClass({
    getInitialState: function() {
        return {
            deviceStatus: this.props.babblerDevice.deviceStatus(),
            dataFlow: []
        };
    },
    
    componentDidMount: function() {
        // слушаем статус устройства
        this.babblerDeviceListener = function onStatusChange(status) {
            this.setState({deviceStatus: status});
        }.bind(this);
        this.props.babblerDevice.addOnStatusChangeListener(this.babblerDeviceListener);
        
        // счетчик элементов, нужен для идентификатора элементов
        this.itemKeyCounter = 0;
        
        function timestamp() {
            var now = new Date();
            return now.getFullYear() + "/" + now.getMonth() + "/" + now.getDay() + " " + 
                now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + " " +
                now.getMilliseconds();
        }
        
        // слушаем данные от устройства
        this.dataListener = function onData(data, dir) {
            var mark;
            var style;
            if(dir == BBLR_DATA_FLOW_IN) {
                mark = "in>>";
                style = {color: deepPurple900};
            } else if(dir == BBLR_DATA_FLOW_OUT) {
                mark = "out<<";
                style = {color: lime900};
            } else {//if(dir == BBLR_DATA_FLOW_QUEUE) {
                mark = "queue<<";
                style = {color: yellow900};
            }
            
            this.itemKeyCounter++;
            var logElem =
                <span key={this.itemKeyCounter} style={style}>
                    {this.props.timestamp ? "[" + timestamp() + "] " : ""}{mark}{data}<br/>
                </span>;
                
            if(!this.props.reverseOrder) {
                if(this.props.maxItems != undefined && this.state.dataFlow.length >= this.props.maxItems) {
                    // удаляем самое старое событие из начала массива
                    this.state.dataFlow.shift();
                }
                // последнее событие в конец массива
                this.state.dataFlow.push(logElem);
            } else {
                if(this.props.maxItems != undefined && this.state.dataFlow.length >= this.props.maxItems) {
                    // удаляем самое старое событие из конца массива
                    this.state.dataFlow.pop();
                }
            
                // последнее событие в начало массива
                this.state.dataFlow.splice(0, 0, logElem);
            }
            // перерисовать
            this.setState({dataFlow: this.state.dataFlow});
        }.bind(this);
        this.props.babblerDevice.addOnDataListener(this.dataListener);
        
        // слушаем ошибки разбора данных устройства
        this.dataErrorListener = function(data, error, dir) {
            var mark = (dir == BBLR_DATA_FLOW_IN ? "err>>" : "err<<");
            var style = {color: red200};
            
            this.itemKeyCounter++;
            var logElem = 
                <span key={this.itemKeyCounter} style={style}>
                    {this.props.timestamp ? "[" + timestamp() + "] " : ""}{mark}{error.toString()}:<br/>
                    <span style={{fontStyle: "italic"}}>{data.toString()}</span><br/>
                </span>;
            if(!this.props.reverseOrder) {
                // последнее событие в конец массива
                this.state.dataFlow.push(logElem);
            } else {
                // последнее событие в начало массива
                this.state.dataFlow.splice(0, 0, logElem);
            }
            // перерисовать
            this.setState({dataFlow: this.state.dataFlow});
        }.bind(this);
        this.props.babblerDevice.addOnDataErrorListener(this.dataErrorListener);
    },
    
    componentWillUnmount: function() {
        // почистим слушателей
        this.props.babblerDevice.removeOnStatusChangeListener(this.babblerDeviceListener);
        this.props.babblerDevice.removeOnDataListener(this.dataListener);
        this.props.babblerDevice.removeOnDataErrorListener(this.dataParseErrorListener);
    },
    
    render: function() {
        var connected = this.state.deviceStatus === BBLR_STATUS_CONNECTED ? true : false;
        return (
            <div style={this.props.style}>
                {this.state.dataFlow}
            </div>
        );
    },
});

// отправляем компонент на публику
module.exports = BabblerDataFlow;

