SET ROLE adblock;
create database adblock WITH OWNER=adblock;
\connect adblock
SET ROLE adblock;

CREATE TABLE image_data_table (
  id bigserial primary key,
  domain text,
  page_url text,
  frame_id text,
  frame_name text,
  parent_frame_id text,
  parent_frame_name text,
  frame_url text,
  resource_type text,
  resource_url text,
  imaged_data text, -- uri of the image file with the image or iframe screenshot
  content_length bigint default null,
  sha1_resource_url bit(160) default null,
  date date default now()
);

-- CREATE INDEX resource_url_hash_idx ON scrap USING HASH (resource_url);
-- CREATE INDEX resource_url_idx ON scrap (md5(resource_url));
-- CREATE INDEX page_url_idx ON scrap (md5(page_url));
-- CREATE INDEX resource__page_url_idx ON scrap (md5(resource_url),md5(page_url));
-- CREATE INDEX imaged_data_idx ON scrap USING HASH (imaged_data);
-- CREATE INDEX frame_id_idx ON scrap (frame_id);
-- CREATE INDEX frame_url_idx ON scrap (frame_url);

CREATE TABLE errors (
  id bigserial primary key,
  page_url text,
  error_timeout boolean default false,
  error_page_crash boolean default false,
  error_failsafe_timeout boolean default false,
  date date default now()
);

CREATE TABLE graphml_mappings (
    id bigserial primary key,
    file_name text,
    page_url text,
    date date default now()
);

-- CREATE INDEX domain_idx ON domains (domain);
-- CREATE INDEX wprgo_file_idx ON domains (wprgo_file);
-- CREATE INDEX domains_date_idx ON domains (date);