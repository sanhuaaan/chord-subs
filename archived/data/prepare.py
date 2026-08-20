"""Deja el volcado de Chordonomicon listo para build.mjs.

    python3 -m venv venv && venv/bin/pip install duckdb
    venv/bin/python data/prepare.py songs.jsonl

Chordonomicon (679.807 canciones con las partes marcadas) no trae título ni
intérprete: solo un id de Spotify en dos de cada tres filas. Los títulos salen
de un join contra un volcado público de 56 millones de pistas, que se lee por
HTTP sin descargarlo entero —duckdb se baja solo las tres columnas que hacen
falta— y cubre el 87,5% de los ids. De ese volcado se toma únicamente el hecho:
título e intérprete, que existen con independencia de Spotify. Nada de lo suyo
(popularidad, audio features) se guarda ni se usa.

Las filas cuyo id no casa pero cuyo intérprete sí aparece en otra fila que sí
casó heredan el nombre del intérprete: son 80.000 canciones más con al menos
media identidad.
"""
import sys
import duckdb

OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "songs.jsonl"
CHORDONOMICON = ("https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/"
                 "refs%2Fconvert%2Fparquet/default/train/0000.parquet")
TRACKS = ("https://huggingface.co/datasets/GildasLeDrogoff/"
          "spotify-huge-track-analysis-dataset/resolve/main/spotify-huge-audio-features.parquet")

c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs;")

print("bajando Chordonomicon (92 MB)…", flush=True)
c.sql(f"CREATE TABLE chordonomicon AS SELECT * FROM '{CHORDONOMICON}'")

print("resolviendo títulos contra el volcado de pistas…", flush=True)
c.sql("""CREATE TABLE wanted AS
         SELECT DISTINCT spotify_song_id AS id FROM chordonomicon
         WHERE spotify_song_id IS NOT NULL""")
c.sql(f"""CREATE TABLE tracks AS
          SELECT s.track_id,
                 any_value(s.track_name) AS track_name,
                 any_value(s.artist_name) AS artist_name
          FROM '{TRACKS}' s SEMI JOIN wanted q ON s.track_id = q.id
          GROUP BY s.track_id""")
print("  ids resueltos:", c.sql("SELECT count(*) FROM tracks").fetchone()[0], flush=True)

c.sql("""CREATE TABLE songs AS
         SELECT ch.*, p.track_name AS title, p.artist_name AS artist
         FROM chordonomicon ch LEFT JOIN tracks p ON ch.spotify_song_id = p.track_id""")
# El nombre del intérprete, propagado por su id de Spotify a las filas sin match.
c.sql("""CREATE TABLE artists AS
         SELECT spotify_artist_id AS aid, arg_max(artist, n) AS artist FROM (
           SELECT spotify_artist_id, artist, count(*) AS n FROM songs
           WHERE spotify_artist_id IS NOT NULL AND artist IS NOT NULL GROUP BY 1, 2)
         GROUP BY 1""")

c.sql(f"""COPY (
  SELECT c.id, c.chords, c.title,
         coalesce(c.artist, i.artist) AS artist,
         try_cast(substr(c.release_date, 1, 4) AS INTEGER) AS year,
         c.main_genre AS genre
  FROM songs c LEFT JOIN artists i ON c.spotify_artist_id = i.aid
) TO '{OUTPUT}' (FORMAT JSON)""")
print("escrito", OUTPUT, c.sql("SELECT count(title) FROM songs").fetchone()[0], "con título")
