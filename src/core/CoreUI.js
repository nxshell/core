const { BrowserWindow, dialog } = require("electron");

module.exports = {
    showOpenDialog(options) {
        //const currentWindow = BrowserWindow.getFocusedWindow();
        let ret = dialog.showOpenDialogSync(options);
        if(ret === undefined) {
            return {canceled: true, filePaths: []};
        } else {
            return {canceled: false, filePaths: ret};
        }
    },

    showSaveDialog(options) {
        //const currentWindow = BrowserWindow.getFocusedWindow();
        let ret = dialog.showSaveDialogSync(options);
        if(ret === undefined) {
            return {canceled: true, filePath: null};
        } else {
            return {canceled: false, filePath: ret};
        }
    },

    showMessageBox(options) {
        //const currentWindow = BrowserWindow.getFocusedWindow();
        return dialog.showMessageBox( options);

    }
}