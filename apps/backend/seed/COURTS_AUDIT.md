# Court seed audit

Last reviewed: 2026-08-02

`courts.csv` is limited to real, currently operating beach/sand volleyball courts. A venue may be indoors, but its playing surface must be sand. Court counts describe the normal fixed layout; seasonal or unpublished counts are left blank or explained in the description.

The startup seeder is intentionally additive and preserves user edits. Removing or correcting a CSV row does not delete or overwrite an existing database record. Review database drift separately before deactivating or changing any existing record.

## Removed from the seed catalog

| Slug | Reason | Evidence |
| --- | --- | --- |
| `sand-santa-cruz-indoor-santa-cruz` | Current club operates indoor hard-court open gyms, not sand | [Sand Santa Cruz](https://sandsantacruz.com/adult-open-gyms/) |
| `garland-park-denver` | Denver's current inventory identifies the volleyball field as turf | [Denver athletic field inventory](https://www.denvergov.org/files/assets/public/v/2/parks-and-recreation/documents/rentals-amp-permits/athletics-amp-fields/2025-springsummer-athleticfieldinventory.pdf) |
| `lv-beach-volleyball-las-vegas` | Club programming is at Sunset Park; the seeded address is not a four-court sand venue | [Las Vegas Beach Volleyball](https://lasvegasbeachvolleyball.com/) |
| `desert-breeze-park-las-vegas` | Current official facility listing does not substantiate sand courts | [Clark County](https://www.clarkcountynv.gov/government/departments/parks___recreation/facilities/desert-breeze-community-center) |
| `baker-beach-volleyball-court-san-francisco` | NPS amenities do not list a permanent volleyball court | [National Park Service](https://www.nps.gov/places/000/baker-beach.htm) |
| `sand-key-park-clearwater` | Current official amenities and map omit volleyball | [Pinellas County](https://pinellas.gov/parks/sand-key-park/) |
| `dig-and-dive-wilmington` | Venue closed in 2020 | [WWAY](https://www.wwaytv3.com/restaurant-catered-to-volleyball-community-closes/) |
| `mike-chappell-park-carolina-beach` | Official amenities do not include volleyball | [Carolina Beach](https://www.carolinabeach.gov/Facilities/Facility/Details/Mike-Chappell-Park-2) |
| `folly-beach-county-park-folly-beach` | Seed pointed at the county park; active play is by the pier | [Folly Beach](https://follybeach.com/pier/) |
| `vollis-beach-nashville` | Physical venue is no longer operating | [Vollis Beach](https://vollisbeach.com/) |
| `emmitt-park-san-antonio` | No current city park or sand venue could be substantiated at the address | Field verification required before re-adding |
| `woodlawn-lake-park-san-antonio` | Current official amenities omit volleyball | [San Antonio](https://www.sa.gov/Directory/Departments/Parks/Parks-Facilities/Parks/Directory/Woodlawn-Lake-Park) |

## Addition sources

- Austin's six added parks: [official sand-volleyball inventory](https://www.austintexas.gov/parks/sand-volleyball-courts)
- Miami Beach's four added parks: [official volleyball inventory](https://www.miamibeachfl.gov/city-hall/parks-and-recreation/sports-centers-fields-and-courts/volleyball/)
- Arlington's five added parks: [official outdoor-sand schedule](https://www.arlingtonva.us/Government/Departments/Parks-Recreation/Programs/Sports/Volleyball)
- [Wakefield Crowbar](https://wakefieldcrowbar.com/reservations/), [Manhattan Park](https://www.eastgrmi.gov/599/Manhattan-Park-Facility-Rentals), [Beachwood](https://beachwoodohio.com/144/Tennis-Volleyball), and [Shawnee Mission Beach Volleyball](https://smbv.com/)
- [Olney Manor](https://montgomeryparks.org/parks-and-trails/olney-manor-recreational-park/), [Ontario Beach](https://www.monroecounty.gov/parks-ontariobeach), and [Cauley Creek](https://johnscreekga.gov/recreation-parks/parks/cauley-creek-park/)
- [Atlanta Beach House](https://atlantavolleyballacademy.sportngin.com/adult), [Alpharetta Beach](https://www.alpharettabeach.com/home), [Cedar Beach](https://www.townofbabylonny.gov/437/Cedar-Beach), and [Point Lookout](https://vbchempstead.app.sportimeny.com/)

## Deferred candidates

These plausible omissions were not added because surface, access, permanence, or exact location remains unclear: The Yard at College of Charleston, Georgia State Beach Complex, Lido Beach Town Park, planned Carolina Beach courts, Whalebone Park, West Sunset Playground, Grafton Lakes State Park, Heyday at North Beach, Spikes N Strikes, Sussex Place, and Beach House Volleyball Peoria.

## Expansion research prompt

Use the following prompt for each metro-area review. It intentionally covers the informal, landmark-based sites that a facility-directory-only search misses:

> Audit every plausible place to play beach or sand volleyball in **[metro and surrounding radius]** against the active court database. Include permanent public courts, paid facilities, indoor sand, natural beaches with poles or recurring bring-your-own-net play, and courts known mainly by landmarks or local nicknames (for example “north end,” “by the windmill,” or “under the bridge”). Search the central city plus adjacent municipalities, regional park districts, universities, bars/clubs, waterfronts, and beaches. Use multiple query patterns: `sand volleyball`, `beach volleyball`, `volleyball area`, `volleyball poles`, `BYON`, `pickup beach volleyball`, and landmark/neighborhood variants. Check official park maps and amenity inventories, operator pages, current league/event schedules, map imagery/listings, and recent local community discussions. Treat community sources as discovery leads, then corroborate existence and current play with an official/operator source or two independent recent sources. Do not reject a real site merely because it lacks permanent nets, a stable court count, a formal facility name, or a postal address. Record aliases, landmark directions, access model, seasonality, whether nets are provided, confidence by field, evidence URLs, and the date checked. Separate confirmed additions, corrections/aliases to existing rows, duplicates, restricted/private facilities, planned/closed venues, and field-check candidates. Beach or sand playing surfaces only.

For omission reviews, compare by coordinates and aliases as well as exact names. Search beyond each seed hub's named center city; a user searching “Oakland” may reasonably mean Alameda, Berkeley, or another nearby East Bay court.

Completeness checks are mandatory: enumerate every matching result in each municipal park directory; search city, county, regional, state, university, and beach operators separately; and reconcile any published system-wide court total against the candidates found. Do not stop after finding a few flagship venues. A verified venue may be seeded with an unknown court count or temporarily missing coordinates when the venue itself is certain; record field-level uncertainty instead of discarding the entire venue.

## 2026-08-02 expansion pass

The expanded prompt produced 38 additional corroborated venues. Principal system-wide sources included [LA County Beaches](https://beaches.lacounty.gov/la-county-beaches-volleyball-courts/), [Scottsdale sand volleyball](https://www.scottsdaleaz.gov/adult-sports/sand-volleyball), [Chicago Park District facilities](https://www.chicagoparkdistrict.com/parks-facilities), and [Salt Lake City park amenities](https://www.slc.gov/parks/park-pavilions-amenities/). Individual official sources included [Sunset Park](https://www.clarkcountynv.gov/government/departments/parks___recreation/services/area_reservations/sunset-park-webpage), [Esker Point](https://grotonct.myrec.com/info/facilities/details.aspx?FacilityID=14835), [Roosevelt Park](https://www.middlesexcountynj.gov/Home/Components/News/News/1722/328), [Roberts Regional](https://www.ebparks.org/parks/roberts), [Crown Beach](https://www.ebparks.org/maps/crown-beach), [Scioto Audubon](https://www.metroparks.net/parks-and-trails/scioto-audubon/), and [Ellenberger Park](https://parks.indy.gov/parks/ellenberger-park/).

Deferred despite being real: Springettsbury Park and Hopatcong State Park need better location hubs; Canterbury Park is under construction; Hammonasset's volleyball surface is not explicit; and several additional Scottsdale, Salt Lake City, Boulder, Colorado Springs, Aurora, Minneapolis, and Kansas City leads still need row-level count/access verification.

West Seneca additions include [Holidays Sports Bar and Volleyball](https://www.holidaysvolleyball.net/), whose current operator confirms year-round indoor/outdoor sand play, plus Veterans Park and The R.O.C.K.'s four outdoor courts. The latter two sand surfaces were locally field-confirmed on 2026-08-02; [The R.O.C.K. operator](https://www.thechampionprojectwny.com/therock) confirms the current address and court access, while the [West Seneca park directory](https://westseneca.org/community/parks/) confirms Veterans Park's current public amenities and address.

## Canada expansion

Canada is represented with country-aware hubs instead of being folded into nearby U.S. markets. The current official-source pass covers British Columbia, Alberta, Saskatchewan, Manitoba, Ontario, Québec, Nova Scotia, Prince Edward Island, New Brunswick, and Newfoundland and Labrador. Core inventories include [Vancouver](https://vancouver.ca/parks-recreation-culture/volleyball.aspx), [Québec City's June 2026 inventory](https://www.ville.quebec.qc.ca/nous_joindre/311/banque-info/info.aspx?NoFiche=AC-000895), [Ottawa's live sand-court GIS layer](https://maps.ottawa.ca/ArcGIS/rest/services/Parks_Inventory/MapServer/22), [Calgary](https://www.calgary.ca/parks/activities/beach-volleyball-courts.html), [Edmonton/Volleyball Alberta](https://www.volleyballalberta.ca/beach-volleyball/beach-facilities/), and [Winnipeg](https://www.winnipeg.ca/people-culture/our-city-our-stories/plenty-places-test-out-summer-olympics-sports-winnipeg).

Ottawa's live inventory resolves the frequently cited 118-court figure into 109 sand courts, eight grass courts, and one gravel court. The seed now enumerates all 30 sand locations and treats Stuemer Park as the official inventory name for the Petrie Island court bank, avoiding a duplicate. Toronto additions are backed by current operators at [JAM Sportsplex](https://www.jamsportsplex.com/) and the [Toronto Volleyball Centre](https://torontovolleyballcentre.ca/indoor-beach-location/). Atlantic additions use current municipal or provincial-operator evidence, including [Volleyball Nova Scotia](https://volleyballnovascotia.ca/page.php?page_id=76223), [Fredericton](https://www.fredericton.ca/recreation-leisure/facilities-rentals/outdoor-courts), [Saint John](https://saintjohn.ca/en/news-and-notices/little-river-reservoir-beach-volleyball-court-now-open), and [Paradise](https://www.paradise.ca/parks-recreation-culture/paradise-park/).

The same pass completed remaining U.S. queues using current municipal inventories for [Scottsdale](https://www.scottsdaleaz.gov/adult-sports/sand-volleyball), [Salt Lake City](https://www.slc.gov/parks/park-pavilions-amenities/), [Minneapolis](https://teamsideline.com/sites/minneapolisparks/locations), [Kansas City](https://kcparks.org/amenities/sand-volleyball-court/), [Denver](https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/ODC_PARK_COURTS_A/FeatureServer/83), and [Longmont](https://longmontcolorado.gov/parks-and-natural-resources/parks-and-trails/parks/). Denver's live GIS now explicitly classifies four Garland Park courts as sand, superseding the older athletic-field document that caused the former ambiguous Garland seed to be retired.

Remaining Canadian follow-up priorities: verify secondary Ontario metros and field-check plausible but currently under-documented sites in Victoria, Regina, and Atlantic Canada. Proposed, historical, or access-uncertain facilities remain deferred.

## Coordinate audit

The 2026-08-02 geocoding pass resolved every seed row to a latitude/longitude pair. Automated results were accepted only when they resolved to a specific address, street, park, beach, or facility within the assigned hub's coverage area; broad city, province, and postal-code centroids were rejected. Sixteen ambiguous results were manually reconciled against official park maps, operator direction links, exact intersection geocoding, or government geographic-name data. Distributed beach rows such as Redondo use a representative public access point rather than implying that every court shares one coordinate.

`scripts/geocode_court_seeds.py` preserves this workflow: it is dry-run by default, respects the public Nominatim rate limit, caches responses, filters country by hub, and requires `--apply` before changing the CSV. The seed-data test now requires coordinates for every court and verifies that each point falls within a buffered radius of its assigned hub. That check also identified and corrected three overly broad hub assignments by adding dedicated Colorado Springs, eastern Long Island, and northwest Connecticut hubs.
