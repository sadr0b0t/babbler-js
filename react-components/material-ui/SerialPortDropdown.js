// SerialPortDropdown.js

var React = require('react');

import RaisedButton from 'material-ui/RaisedButton';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';

const btnStyle = {
  margin: 12
};

var SerialPortDropdown = React.createClass({
// http://www.material-ui.com/#/components/raised-button
// http://www.material-ui.com/#/components/dropdown-menu
    getInitialState: function() {
        return {
            portListOpen: false,
            portName: "",
            portList: []
        };
    },
    componentDidMount: function() {
        this.updateSerialPortList();
    },
    
    /** выбран другой порт в списке */
    handlePortNameChange: function(event, index, value) { 
        this.setPortName(value);
    },
    
    render: function() {
        // список устройств
        var portItemList = [];
        for(var i in this.state.portList) {
            var port = this.state.portList[i];
            
            portItemList.push(
                <MenuItem 
                    value={port.comName} 
                    key={port.comName} 
                    primaryText={port.comName + " [" + port.manufacturer + "]"} 
                />
            );
        }
        
        // грязный хак, чтобы комбо-бокс не скакал наверх, 
        // когда в нем нет элементов
        var dropDownStyle = {minWidth: 210};
        if(portItemList.length == 0) {
            dropDownStyle = {minWidth: 210, verticalAlign: "middle"};
        }
        
        return (
            <span>
                <DropDownMenu value={this.state.portName} onChange={this.handlePortNameChange} style={dropDownStyle}>
                    {portItemList}
                </DropDownMenu>
                
                <RaisedButton onClick={this.updateSerialPortList} label="Обновить" style={btnStyle} />
            </span>
        );
    },
    
    /**
     * Задать новое имя порта:
     * - обновить отрисовку
     * - отправить событиы onChange
     */
    setPortName: function(portName) {
        this.setState({portName: portName});
        
        if(this.props.onChange != undefined) {
            this.props.onChange(portName);
        }
    },
    
    /** Обновить список последовательных портов */
    updateSerialPortList: function () {
        var SerialPort = require('serialport');

        // получаем новый список устройств
        SerialPort.list(function (err, ports) {
            // например для ChipKIT Uno32
            // содержимое port:
            //     comName: "/dev/ttyUSB0"
            //     manufacturer: "FTDI"
            //     pnpId: "usb-FTDI_FT232R_USB_UART_AJV9IKS1-if00-port0"
            //     productId: "0x6001"
            //     serialNumber: "FTDI_FT232R_USB_UART_AJV9IKS1"
            //     vendorId: "0x0403"

            var filteredPorts = [];
            // отфильтруем лишние порты
            for(var i in ports) {
                if(ports[i].manufacturer === "FTDI") {
                    filteredPorts.push(ports[i]);
                }
            }
        
            // если старый выбранный порт есть в новом списке, то
            // оставим как есть
            var newPort = filteredPorts.length > 0 ? filteredPorts[0].comName : "";
            for(var i in filteredPorts) {
                if(filteredPorts[i].comName === this.state.portName) {
                    newPort = this.state.portName;
                }
            }
            // заменяем старый список на новый
            this.setState({
                portList: filteredPorts
            });
            // новое значение текущего порта
            this.setPortName(newPort);
        }.bind(this));
    }
});

// отправляем компонент на публику
module.exports = SerialPortDropdown;

