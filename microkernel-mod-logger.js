/*
**  Microkernel -- Microkernel for Server Applications
**  Copyright (c) 2015-2016 Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import Promise from "bluebird"
import path    from "path"
import Winston from "winston"

export default class Module {
    get module () {
        return {
            name:  "microkernel-mod-logger",
            tag:   "LOGGER",
            group: "BOOT",
            after: [ "CTX", "OPTIONS" ]
        }
    }
    latch (kernel) {
        let logfile = path.join(kernel.rs("ctx:basedir"), kernel.rs("ctx:program") + ".log")
        kernel.latch("options:options", (options) => {
            options.push({
                name: "console", type: "bool", "default": false,
                help: "Display logfile also on console." })
            options.push({
                names: [ "logfile", "l" ], type: "string", "default": logfile,
                help: "Path to logfile", helpArg: "PATH" })
            options.push({
                names: [ "loglevel", "L" ], type: "string", "default": "warning",
                help: "Logging (category and) level", helpArg: "[CATEGORY:]LEVEL,..." })
        })
    }
    configure (kernel) {
        /*  configure the logging levels and colors  */
        let config = {
            categories: {
                any:     2
            },
            levels: {
                fatal:   0,
                error:   1,
                warning: 2,
                notice:  3,
                info:    4,
                trace:   5,
                debug:   6
            },
            colors: {
                fatal:   "red",
                error:   "red",
                warning: "yellow",
                notice:  "green",
                info:    "green",
                trace:   "blue",
                debug:   "blue"
            }
        }

        /*  determine wished category and levels  */
        kernel.rs("options:options").loglevel.split(/\s*,\s*/).forEach((level) => {
            let m
            let category = "any"
            if ((m = level.match(/^(.+?):(.+)$/)) !== null) {
                category = m[1]
                level    = m[2]
            }
            if (config.levels[level] === undefined)
                throw new Error("invalid logging level \"" + level + "\"")
            config.categories[category] = config.levels[level]
        })

        /*  create logger instance  */
        let logger = new Winston.Logger({
            levels: config.levels,
            colors: config.colors
        })

        /*  mandatory: add file logger transport  */
        logger.add(new Winston.transports.File({
            level:            "debug",
            filename:         kernel.rs("options:options").logfile,
            handleExceptions: false,
            maxsize:          1024 * 1024 * 1024,
            json:             false,
            timestamp:        true,
            colorize:         false
        }), null, true)

        /*  optional: add console logger transport  */
        if (kernel.rs("options:options").console) {
            logger.add(new Winston.transports.Console({
                level:     "debug",
                timestamp: true,
                colorize:  true
            }), null, true)
        }

        /*  provide cluster-aware and category-aware logging method  */
        kernel.register("log", (category, level, msg, ...params) => {
            let levelNum = config.levels[level]
            let levelMax = (
                config.categories[category] !== undefined ?
                config.categories[category] : config.categories.any
            )
            if (levelNum <= levelMax) {
                msg = category + ": " + msg
                msg = kernel.hook("logger:msg", "pass", msg)
                logger.log(level, msg, ...params)
            }
        })

        return Promise.resolve()
    }
}
