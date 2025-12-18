const formatPrivateKey = (privateKey) => {
    return privateKey.replace(/\\n/g, '\n');
};

module.exports = formatPrivateKey;