const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const DB = {};

const conf = {
    showSql: false,
    database: "jable",
    storage: 'jable.db',
}

DB.sequelize = undefined;

DB.connect = async function() {
    if (DB.sequelize == undefined) {
        DB.sequelize = new Sequelize(conf.database, null, null, {
            dialect: 'sqlite',
            storage: path.join(__dirname, '../' + conf.storage),
            logging: conf.showSql === false ? false : console.log,
        });
        DB.Model = DB.sequelize.define('jable', require('./model'), {
            tableName: 'jable',
            timestamps: false,
            charset: 'utf8',
        });
        DB.Model.replace = function(obj) {
            console.log('replace', obj.id);
            return DB.update("REPLACE INTO `" + 'jable' + "`(id,name,url,jpg,mp4) VALUES(?,?,?,?,?)", [obj.id, obj.name, obj.url, obj.jpg, obj.mp4]);
        };
        await DB.Model.sync({ force: false });
    }
}

DB.query = function(sql, pms) {
    return DB.sequelize.query(sql, {
        raw: true,
        replacements: pms || [],
        type: DB.sequelize.QueryTypes.SELECT,
    });
};

DB.update = function(sql, pms) {
    return DB.sequelize.query(sql, {
        replacements: pms || [],
    });
};

module.exports = DB;