import assert from 'node:assert/strict';
import { test } from 'vitest';
import { nearestSeries } from './nearest-series';

test('finds the nearest line between dots rather than using the nearest endpoint', () => {
  const lines = [
    {id:'rising',points:[{x:0,y:0},{x:100,y:100}]},
    {id:'flat',points:[{x:0,y:40},{x:100,y:40}]},
  ];
  assert.equal(nearestSeries({x:50,y:51},lines),'rising');
  assert.equal(nearestSeries({x:50,y:39},lines),'flat');
});
test('handles isolated dots, duplicate points, empty lines, and missing game data', () => {
  assert.equal(nearestSeries({x:8,y:8},[{id:'dot',points:[{x:10,y:10}]}]),'dot');
  assert.equal(nearestSeries({x:8,y:8},[{id:'duplicate',points:[{x:10,y:10},{x:10,y:10}]}]),'duplicate');
  assert.equal(nearestSeries({x:50,y:50},[
    {id:'gap',points:[{x:0,y:0},null,{x:100,y:100}]},
    {id:'nearby',points:[{x:0,y:60},{x:100,y:60}]},
  ]),'nearby');
  assert.equal(nearestSeries({x:0,y:0},[{id:'empty',points:[null]}]),null);
});
test('keeps the preferred player at overlapping lines, but switches to a closer line', () => {
  const lines=[{id:'a',points:[{x:0,y:10},{x:100,y:10}]},{id:'b',points:[{x:0,y:10},{x:100,y:10}]}];
  assert.equal(nearestSeries({x:50,y:10},lines,'b'),'b');
  lines[0].points=[{x:0,y:20},{x:100,y:20}];
  assert.equal(nearestSeries({x:50,y:19},lines,'b'),'a');
  assert.equal(nearestSeries({x:50,y:10},lines,'removed'),'b');
});
