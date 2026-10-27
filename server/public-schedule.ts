import type { ScheduleResponse } from '../shared/schedule.ts';
/** The retired competition UI's raw terms and unused descriptions stay out of the app feed. */
export function publicSchedule(data:ScheduleResponse):ScheduleResponse {
  return {...data,events:data.events.map(event=>({...event,description:'',disclosure:event.disclosure?{...event.disclosure,terms:undefined}:undefined}))};
}
