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
