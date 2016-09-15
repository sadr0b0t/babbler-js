// SerialPortPopover.js

var React = require('react');

import RaisedButton from 'material-ui/RaisedButton';

import {Popover, PopoverAnimationVertical} from 'material-ui/Popover';
import Menu from 'material-ui/Menu';
import MenuItem from 'material-ui/MenuItem';

const btnStyle = {
  margin: 12
};

var SerialPortPopover = React.createClass({
// http://www.material-ui.com/#/components/raised-button
// http://www.material-ui.com/#/components/popover

    getInitialState: function() {
        return {
            portName: this.props.portName,
            portListOpen: false,
            portList: []
        };
    },
    
    // вызвать список устройств
    handlePortListTouchTap: function(event) {
        // This prevents ghost click.
        event.preventDefault();
    
        // объект event не доступен в колбэках:
        // https://facebook.github.io/react/docs/events.html#event-pooling
        // поэтому нужные поля сохраняем здесь:
        var currentTarget = event.currentTarget;
        this.updateSerialPortList(function(ports) {
            // если старого выбранного порта нет в новом списке,
            // ставим значение undefined
            var found = false;
            for(var i in ports) {
                if(ports[i].comName === this.state.portName) {
                    found = true;
                }
            }
            if(!found) {
                this.setPortName(undefined);
            }
        
            // заменяем старый список на новый и открываем меню выбора
            this.setState({
                portListOpen: true,
                portListAnchorEl: currentTarget,
                portList: ports
            });
        }.bind(this));
    },
    
    // закрываем список устройств
    handlePortListRequestClose: function() {
        this.setState({
          portListOpen: false,
        });
    },
    
    /** выбран другой порт в списке */
    handlePortNameChange: function(event, value) {
        this.setState({
            portListOpen: false
        });
        this.setPortName(value);
    },
    
    render: function() {
        // список устройств
        var portItemList = [];
        if(this.state.portList.length > 0) {
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
        } else {
            portItemList.push(
                <MenuItem 
                    value={""} 
                    key={1} 
                    primaryText={"нет подключенных устройств"}
                />
            );
        }
        
        var portNameEmpty = (this.state.portName ? this.state.portName.trim().length == 0 : true);
        
        var selectBtnLabel = portNameEmpty ? "выбрать устройство" : this.state.portName;
        var selectBtnLabelStyle = portNameEmpty ? undefined : {textTransform: "none"};
        
        return (
            <span>
                <RaisedButton
                    onTouchTap={this.handlePortListTouchTap}
                    label={selectBtnLabel}
                    style={Object.assign({}, btnStyle, {minWidth: 200})}
                    labelStyle={selectBtnLabelStyle}/>
                <Popover
                  open={this.state.portListOpen}
                  anchorEl={this.state.portListAnchorEl}
                  anchorOrigin={{horizontal: 'left', vertical: 'bottom'}}
                  targetOrigin={{horizontal: 'left', vertical: 'top'}}
                  onRequestClose={this.handlePortListRequestClose}
                  animation={PopoverAnimationVertical}>
                  
                    <Menu onChange={this.handlePortNameChange}>
                        {portItemList}
                    </Menu>
                </Popover>
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
    updateSerialPortList: function (onListReady) {
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
            onListReady(filteredPorts);
        }.bind(this));
    }
    
});

// отправляем компонент на публику
module.exports = SerialPortPopover;

