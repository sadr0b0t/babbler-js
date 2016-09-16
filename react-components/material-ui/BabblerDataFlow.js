// BabblerDataFlow.js

var React = require('react');

import {red200, lime900, deepPurple900} from 'material-ui/styles/colors';

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
        
        // слушаем данные от устройства
        this.dataListener = function onData(data, dir) {
            var mark = (dir == BBLR_DATA_FLOW_IN ? "in>>" : "out<<");
            var style = (dir == BBLR_DATA_FLOW_IN ? {color: deepPurple900} : {color: lime900});
            
            var logElem =
                <span key={this.state.dataFlow.length} style={style}>
                    {mark}{data}<br/>
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
        this.props.babblerDevice.addOnDataListener(this.dataListener);
        
        // слушаем ошибки разбора данных устройства
        this.dataParseErrorListener = function(data, error) {
            var logElem = 
                <span key={this.state.dataFlow.length} style={{color: red200}}>
                    {error.toString()}<br/>
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
        this.props.babblerDevice.addOnDataParseErrorListener(this.dataParseErrorListener);
    },
    
    componentWillUnmount: function() {
        // почистим слушателей
        this.props.babblerDevice.removeOnStatusChangeListener(this.babblerDeviceListener);
        this.props.babblerDevice.removeOnDataListener(this.dataListener);
        this.props.babblerDevice.removeOnDataParseErrorListener(this.dataParseErrorListener);
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

