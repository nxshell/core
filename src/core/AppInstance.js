const {BrowserView, BrowserWindow, WebContents} = require("electron");
const {EventEmitter} = require("events");
const path = require("path");
const os = require("os");
const enable_remote = require("@electron/remote/main").enable;

const {PROTOCOL_APP} = require("./Protocol");
const {AppServiceManager, AppService} = require("./AppService");
const {getGlobalExchange} = require("./AppIPC");
const {createWindow, WINDOW_TYPE} = require("./AppViewProvider");

/**
 * @class AppInstance
 */
class AppInstance extends EventEmitter{
    static VIEW_TYPE = {MAIN_WINDOW: 0, SUB_WINDOW: 1}

    /** @type {BrowserView} */
    view = null;
    /** 
     * 应用服务层
     * @memberof AppInstance
     * @type {AppService}
     */
    service = null;
    /* 应用包信息 */
    appPackageInfo = null;
    /* 应用实例ID */
    appInstanceId = -1;

    constructor(appPackageInfo, appInstanceId, args) {
        super();
        /* 考虑到一些特殊情况 */
        this.appPackageInfo = appPackageInfo;
        this.appInstanceId = appInstanceId;

        let init = async ()=> {
            await this._createView();
            this._createService(...args);
            this._initHandlers();
        };
        
        init();
    }

    _initHandlers()  {
        const renderRouter = `${this.appPackageInfo.package.name}-render-${this.appInstanceId}`;
        const currentServiceName = this.appPackageInfo.package.name;
        let webContents = this.view.webContents;
        
        // 初始化IPC
        let ipcExchange = getGlobalExchange();

        this.service.on("message", (data) => {
            ipcExchange.sendTo(renderRouter, currentServiceName, data.body);
        });
        ipcExchange.onRecv(currentServiceName, ({dest, src, body}) => {
            if (this.service.isTerminate) {
                return;
            }
            
            this.service.sendMessage({dest, src, body});
        });
        webContents.on("ipc-message", (evt, channel, ...args) => {
            /**
             * 我们根据Channel来确定数据转发的服务
             * Channel: ptIPC[:serviceName]
             * 如果serviceName没有指定，转发到应用自己的服务
             */
            let [_, service] = channel.split(":");
            if (!service) {
                service = currentServiceName;
            }
            ipcExchange.sendTo(service,
                renderRouter,
                args[0]
            );
        });
        webContents.on('new-window', (event, url, frameName, disposition, options, additionalFeatures) => {
            if (frameName === 'modal') {
                event.preventDefault();
                Object.assign(options, {
                    modal: true,
                    parent: this.view,
                    center: true,
                    resizeable: false,
                    minimizable: false,
                    maximizable: false,
                    closable: true,
                    frame: true
                });
                delete options.x;
                delete options.y;
            }
            options.show = false;

            const newGuest = new BrowserWindow(options);
            newGuest.removeMenu();

            newGuest.show();

            newGuest.loadURL(url);

            event.newGuest = newGuest
        })
        // 初始化应用的Render进程
        ipcExchange.onRecv(renderRouter, ({dest, src, body}) => {
            // 如果网页已经销毁，则不做任何处理
            if (webContents.isDestroyed()) {
                return;
            }

            let channel = "ptIPC";
            if (src !== currentServiceName) {
                channel += ":" + src;
            }

            webContents.send(channel, body);
        });
    }

    _getViewURL() {
        // if (process.env.NODE_ENV === "development") {
        //     return process.env.POWERTOOLS_DEV_START_URL || "http://127.0.0.1:8080";
        // } else {
        //     return `${PROTOCOL_APP}://${this.appPackageInfo.package.name}/${this.appPackageInfo.package.resources.path}${this.appPackageInfo.package.resources.index || 'index.html'}`
        // }
        const isURL = /^https?:\/\/.*/;
        let index = this.appPackageInfo.package.resources.index || "index.html";
        if (isURL.test(this.appPackageInfo.package.resources.index)) {
            return index
        } else {
            return `${PROTOCOL_APP}://${this.appPackageInfo.package.name}/${this.appPackageInfo.package.resources.path}${index}`
        }
    }

    async _createView() {
        let startInfo = this.appPackageInfo.package.start || {};
        this.view = await createWindow(startInfo.view || WINDOW_TYPE.MAIN_WINDOW, startInfo.viewFlags || []);
        if (process.env.NODE_ENV === "development") {
            this.view.webContents.openDevTools();
        }

        this._setIconOnLinux();
        enable_remote(this.view.webContents);
        this.view.loadURL(this._getViewURL());
    }

    _setIconOnLinux() {
        if (os.type() !== 'Linux') {
            return;
        }
        let icon_path = path.join(process.resourcesPath, 'nxshell.png');
        if (process.env.NODE_ENV === "development") {
            icon_path = path.join(process.cwd(), 'nxshell.png');
        }
        this.view.setIcon(icon_path);
    }

    _getServiceModulePath() {
        const packageInfo = this.appPackageInfo;
        if (path.isAbsolute(packageInfo.package.main)) {
            return packageInfo.package.main;
        } else {
            return path.join(packageInfo.appPath, packageInfo.package.main);
        }
    }

    _createService(...args) {
        const packageInfo = this.appPackageInfo;
        if (!packageInfo.package.main) {
            return;
        }
        this.service = AppServiceManager.createService(packageInfo.package.name,
            this._getServiceModulePath(),
            ...args
        );
    }

    /**
     * 设置View或窗口的位置或大小
     * @param {Rect} bounds 设置View位置及大小
     */
    setViewBounds(bounds) {}

    /**
     * 保存View或窗口的大小
     */
    saveViewBounds() {}

    close() {
        if(this.service) {
            const packageInfo = this.appPackageInfo;
            if (!packageInfo.package.main) {
                return;
            }
            AppServiceManager.terminateService(packageInfo.package.name,
                this.appInstanceId,
                true
            );
            this.service = null;

            let ipcExchange = getGlobalExchange();
            const currentServiceName = this.appPackageInfo.package.name;
            ipcExchange.disconnect(currentServiceName);
        }
    }
}

module.exports = AppInstance;
