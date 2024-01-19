module.exports = (fn) => {
    return (req , res , next) => {
        fn(req , res , next).catch(next);
    }
}

// In summary, this code exports a higher-order function that wraps another function (fn) to ensure that any errors thrown by fn are caught and passed to the Express.js next middleware function for error handling.

// to handle async errors in javascript,it replaces try , catch block.
// it wraps an async function.