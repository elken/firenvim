import { KeydownHandler } from "./KeyHandler";
import { confReady, getGlobalConf, GlobalSettings } from "./utils/configuration";
import { setupInput } from "./input";
import { PageEventEmitter } from "./page";

function print (...args: any[]) {
    return browser.runtime.sendMessage({
        args: [(new Error()).stack.replace(/@moz-extension:\/\/[^/]*/g, ""), args],
        funcName: ["console", "log"],
    });
}

window.console.log = print;
window.console.error = print;

const rects = document.documentElement.getClientRects();

const canvas = document.createElement("canvas");
canvas.id = "canvas";
canvas.oncontextmenu = () => false;
canvas.width = rects[0].width;
canvas.height = rects[0].height;
canvas.style.position = "absolute";
canvas.style.top = "0px";
canvas.style.left = "0px";
document.body.appendChild(canvas);

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });

class ThunderbirdPageEventEmitter extends PageEventEmitter {
    private resizeCount = 0;
    constructor() {
        super();
        window.addEventListener("resize", (() => {
            this.resizeCount += 1;
            this.emit("resize", [this.resizeCount, window.innerWidth, window.innerHeight]);
        }).bind(this));
    }
    async evalInPage(js: string) { return eval(js) }
    async focusInput() { return Promise.resolve(); }
    async focusPage() { return Promise.resolve(); }
    async getEditorInfo() { return [document.location.href, "", [1, 1], undefined] as [string, string, [number, number], string] }
    async getElementContent() {
        const details = await browser.runtime.sendMessage({ funcName: ["getOwnComposeDetails"], args: [] });
        if (details.isPlainText) {
            return details.plainTextBody;
        }

        const nodeToString = (quote: string, n: Node) => {
            switch (n.nodeType) {
                case Node.ELEMENT_NODE:
                    return elementToString(quote, (n as Element));
                case Node.TEXT_NODE: {
                    const s = n.textContent.trim();
                    if (s.length > 0) {
                        if (quote !== "") {
                            quote = quote + " ";
                        }
                        return quote + s + "\n";
                    }
                    return s;
                }
            }
        };
        const elementToString = (quote: string, n: Element) => {
            if (n.tagName === "BR") {
                return "";
            }

            let quotes = quote;
            if (n.tagName === "BLOCKQUOTE") {
                    quotes = quotes + ">";
            }

            let result = "";
            for (const c of Array.from(n.childNodes)) {
                const s = nodeToString(quotes, c);
                if (s !== "") {
                    result += s;
                }
            }

            if (n.tagName === "BLOCKQUOTE") {
                result += quote + "\n";
            }
            return result;
        }
        return elementToString("", document.body);
    }
    async hideEditor() { return Promise.resolve(); }
    async killEditor() {
        return browser.runtime.sendMessage({
            funcName: ["closeOwnTab"]
        });
    }
    async pressKeys(_: any[]) { return Promise.resolve(); }
    async resizeEditor(_: number, __: number) {
        // Don't do anything, resizing is fully controlled by resizing the
        // compose window
        return Promise.resolve();
    }
    async setElementContent(_: string) { return; }
    async setElementCursor(_: number, __: number) { return Promise.resolve(); }
}

class ThunderbirdKeyHandler extends KeydownHandler {
    constructor(settings: GlobalSettings) {
        super(document.documentElement, settings);
        const acceptInput = ((evt: any) => {
            this.emit("input", evt.data);
            evt.preventDefault();
            evt.stopImmediatePropagation();
        }).bind(this);
        document.documentElement.addEventListener("beforeinput", (evt: any) => {
            if (evt.isTrusted && !evt.isComposing) {
                acceptInput(evt);
            }
        });
    }

    focus() {
        window.focus();
        document.documentElement.focus();
    }
}

confReady.then(async () => {
    setupInput(
        new ThunderbirdPageEventEmitter(),
        canvas,
        new ThunderbirdKeyHandler(getGlobalConf()),
        connectionPromise);
});
