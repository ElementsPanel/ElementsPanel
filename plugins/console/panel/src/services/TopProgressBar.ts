class TopProgressBar {
    private element: HTMLElement | null = null;
    private timer: number | null = null;
    private progress: number = 0;
    private isDone: boolean = false;
    private hideTimeout: number | null = null;

    constructor() {
        this.init();
    }

    private init() {
        if (typeof document === "undefined") return;

        if (document.getElementById("top-progress-bar")) {
            this.element = document.getElementById("top-progress-bar");
            return;
        }

        this.element = document.createElement("div");
        this.element.id = "top-progress-bar";
        document.body.appendChild(this.element);
    }

    start() {
        if (!this.element) this.init();

        this.isDone = false;
        this.progress = 0;

        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        if (this.element) {
            this.element.classList.add("active");
            this.element.style.width = "0%";
            this.element.style.opacity = "1";
        }

        this.inc();
    }

    private inc() {
        if (this.isDone) return;

        if (this.timer) {
            clearTimeout(this.timer);
        }

        let amount = 0;
        if (this.progress >= 0 && this.progress < 0.2) {
            amount = 0.1;
        } else if (this.progress >= 0.2 && this.progress < 0.5) {
            amount = 0.04;
        } else if (this.progress >= 0.5 && this.progress < 0.8) {
            amount = 0.02;
        } else if (this.progress >= 0.8 && this.progress < 0.99) {
            amount = 0.005;
        }

        this.progress += amount;

        if (this.progress > 0.994) {
            this.progress = 0.994;
        }

        if (this.element) {
            this.element.style.width = `${this.progress * 100}%`;
        }

        this.timer = window.setTimeout(() => {
            this.inc();
        }, 200);
    }

    done() {
        this.isDone = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.element) {
            this.element.style.width = "100%";

            this.hideTimeout = window.setTimeout(() => {
                if (this.element) {
                    this.element.style.opacity = "0";
                    this.element.classList.remove("active");

                    setTimeout(() => {
                        if (this.element && !this.element.classList.contains("active")) {
                            this.element.style.width = "0%";
                        }
                    }, 400);
                }
            }, 1000);
        }
    }
}

export const topProgressBar = new TopProgressBar();
