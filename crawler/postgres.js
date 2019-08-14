const fs = require('fs');
const { sql, createPool } = require('slonik');
const sqorn = require('@sqorn/pg');

const path = require('path');
const slugify = require('slugify');

const sq = sqorn();
let ClientConfigurationType = {
    captureStackTrace: false,
    connectionTimeout: 20000,
    idleTimeout: 30000,
    maximumPoolSize: 20,
    minimumPoolSize: 4
};

const pool = createPool(process.env.PG_CONNECTION_STRING, ClientConfigurationType);
const imageDataTable = 'image_data_table'
const graphmlMappingTable = 'graphml_mappings';
const errorsTable = 'errors';
const file_error_path = path.join(__dirname, 'database-errors');

async function postgresInsertImageData(data) {
    const query = sq.from(imageDataTable).insert(data).query;
    pool.query(sql`${sql.raw(query.text, query.args)}`)
        .catch(err => {
            fs.writeFileSync(
                file_error_path + slugify(data.page_url),
                "Error inserting image resource into the database: " + err.stack,
                'a'
            )
        });
}

async function postgresInsertGraphMLMapping(mapping) {
    const query = sq.from(graphmlMappingTable).insert(mapping).query;
    pool.query(sql`${sql.raw(query.text, query.args)}`)
        .catch(err => {
            fs.writeFileSync(
                file_error_path + slugify(mapping.page_url),
                "Error inserting graphml mapping into the database: " + err.stack,
                'a'
            )
        });
}

async function postgresInsertError(error) {
    const query = sq.from(errorsTable).insert(error).query;
    pool.query(sql`${sql.raw(query.text, query.args)}`)
        .catch(err => {
            fs.writeFileSync(
                file_error_path + slugify(error.page_url),
                "Error inserting error into the database: " + err.stack,
                'a')
        });
}

module.exports = {
    postgresInsertImageData: postgresInsertImageData,
    postgresInsertGraphMLMapping: postgresInsertGraphMLMapping,
    postgresInsertError: postgresInsertError
}