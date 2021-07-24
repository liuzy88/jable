const Sequelize = require('sequelize');

module.exports = {
    id: {
        type: Sequelize.STRING(32),
        allowNull: false,
        primaryKey: true,
        comment: '地址',
    },
    name: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        comment: '标题',
    },
    url: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        comment: '地址',
    },
    jpg: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        comment: '图片',
    },
    mp4: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        comment: '视频',
    },
    saved: {
        type: Sequelize.INTEGER(1),
        allowNull: false,
        defaultValue: 0,
        comment: '是否已硬存',
    },
};