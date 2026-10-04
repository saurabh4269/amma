import { z } from 'zod';
import { Id } from './content.ts';

/** How much care a facility is set up to give, as far as its source says. Not a statement that it is open or staffed. */
export const FacilityLevel = z.enum(['hospital', 'health_centre', 'clinic', 'post', 'unknown']);
export type FacilityLevel = z.infer<typeof FacilityLevel>;

export const PlaceSource = z.strictObject({
  id: Id,
  title: z.string(),
  /** Copied from the data manifest. "unknown" stays "unknown". */
  license: z.string(),
  url: z.string(),
  /** Whether this source's facility types come from an official list and can be relied on for "nearest hospital". */
  typedLevels: z.boolean(),
});

export const Facility = z.strictObject({
  id: z.string(),
  name: z.string(),
  level: FacilityLevel,
  /** The type exactly as the source wrote it. */
  sourceType: z.string(),
  ownership: z.string().optional(),
  region: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  phone: z.string().optional(),
  source: Id,
});
export type Facility = z.infer<typeof Facility>;

export const PlacePack = z.strictObject({
  id: Id,
  name: z.string(),
  built: z.iso.date(),
  sources: z.array(PlaceSource),
  facilities: z.array(Facility),
  /** What the build did, so a reader can judge the list. */
  report: z.strictObject({
    read: z.record(Id, z.number().int()),
    noCoordinates: z.record(Id, z.number().int()),
    droppedAsDuplicates: z.number().int(),
    byLevel: z.record(FacilityLevel, z.number().int()),
  }),
});
export type PlacePack = z.infer<typeof PlacePack>;
