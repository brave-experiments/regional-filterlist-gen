SET ROLE crawler;
create database crawling_results WITH OWNER=crawler;
\connect crawling_results
SET ROLE crawler;

-- table for all the image data
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
  is_classified_as_ad boolean default null,
  is_one_by_one_pixel boolean default false,
  has_been_classified boolean default false,
  date date default now()
);

-- table for potential errors
CREATE TABLE errors (
  id bigserial primary key,
  page_url text,
  error_timeout boolean default false,
  error_page_crash boolean default false,
  error_failsafe_timeout boolean default false,
  date date default now()
);

-- tables with the graphml mapping, from filenames to the url it represents
CREATE TABLE graphml_mappings (
    id bigserial primary key,
    file_name text,
    page_url text,
    date date default now()
);
