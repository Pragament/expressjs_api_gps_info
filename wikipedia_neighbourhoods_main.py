import requests
from bs4 import BeautifulSoup
import json
import re

def dms_to_decimal(coord):
    if not coord:
        return None
    # Try to parse as float first
    try:
        return float(coord)
    except:
        pass
    # Parse DMS format
    dms_regex = re.compile(
        r'(?P<deg>\\d+)[°:]\\s*(?P<min>\\d+)?[′:\']?\\s*(?P<sec>\\d+(?:\\.\\d+)?)?[″:\"]?\\s*(?P<dir>[NSEW])'
    )
    match = dms_regex.search(coord)
    if not match:
        return None
    deg = float(match.group('deg'))
    min = float(match.group('min') or 0)
    sec = float(match.group('sec') or 0)
    direction = match.group('dir')
    decimal = deg + min / 60 + sec / 3600
    if direction in ['S', 'W']:
        decimal = -decimal
    return decimal

def get_wikipedia_place_details(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Place name
        place_name_element = soup.find('h1', id='firstHeading')
        place_name = place_name_element.text.strip() if place_name_element else "N/A"

        # Place type
        place_type = "Neighborhood"

        # Coordinates
        geo_span = soup.find('span', class_='geo')
        if geo_span:
            lat_str, lon_str = geo_span.text.split(';')
            latitude = float(lat_str.strip())
            longitude = float(lon_str.strip())
        else:
            lat_element = soup.find('span', class_='latitude')
            lon_element = soup.find('span', class_='longitude')
            lat = lat_element.text if lat_element else None
            lon = lon_element.text if lon_element else None
            latitude = dms_to_decimal(lat) if lat else None
            longitude = dms_to_decimal(lon) if lon else None

        if latitude is None or longitude is None:
            print(f"Skipping {place_name} (no coordinates)")
            return None

        # Infobox details
        infobox = soup.find('table', class_='infobox ib-settlement vcard')
        details = {}
        if infobox:
            for row in infobox.find_all('tr'):
                if row.th and row.td:
                    key = row.th.text.strip()
                    value = row.td.text.strip()
                    if key in ['Country', 'State', 'Region', 'District', 'PIN', 'Parliament constituencies', 'Sasana Sabha constituencies']:
                        details[key] = value

        # Images
        images = []
        for img in soup.find_all('img'):
            img_src = img.get('src')
            if img_src and not img_src.endswith('.svg'):
                images.append('https:' + img_src)

        place_data = {
            'placeName': place_name,
            'placeType': place_type,
            'country': details.get('Country', 'N/A'),
            'state': details.get('State', 'N/A'),
            'region': details.get('Region', 'N/A'),
            'district': details.get('District', 'N/A'),
            'pincode': details.get('PIN', 'N/A'),
            'lokSabhaConstituency': details.get('Parliament constituencies', 'N/A'),
            'vidhanSabhaConstituency': details.get('Sasana Sabha constituencies', 'N/A'),
            'imageUrls': images if images else [],
            'latitude': latitude,
            'longitude': longitude
        }
        print(f"Added: {place_name} ({latitude}, {longitude})")
        return place_data
    except Exception as e:
        print(f"Error processing {url}: {e}")
        return None

def scrape_neighborhoods_and_save(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        base_url = 'https://en.wikipedia.org'
        all_place_data = []
        current_region = 'N/A'
        for element in soup.find_all(['h3', 'ul']):
            if element.name == 'h3':
                current_region = element.text.strip()
            elif element.name == 'ul':
                for li in element.find_all('li'):
                    link = li.find('a', href=True)
                    if link:
                        name = link.text.strip()
                        if name:
                            neighborhood_url = base_url + link['href']
                            print(f"Processing {name} in region {current_region}...")
                            place_data = get_wikipedia_place_details(neighborhood_url)
                            if place_data:
                                place_data['region'] = current_region
                                all_place_data.append(place_data)
        with open('neighborhoods_data_ss.json', 'w', encoding='utf-8') as json_file:
            json.dump(all_place_data, json_file, indent=4, ensure_ascii=False)
        print(f"All data saved to 'neighborhoods_data_ss.json'. Total: {len(all_place_data)} neighborhoods.")
    except Exception as e:
        print(f"Error scraping neighborhoods: {e}")

url = 'https://en.wikipedia.org/wiki/List_of_neighbourhoods_in_Hyderabad'
scrape_neighborhoods_and_save(url)