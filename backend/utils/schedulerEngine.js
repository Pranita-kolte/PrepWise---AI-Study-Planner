// Deterministic Algorithmic Scheduling Engine

function getAvailableSlots(dayOfWeek, blockedTimes) {
    // Assume standard waking hours 08:00 to 22:00 (14 available hours)
    let freeSlots = [];
    for(let hour = 8; hour < 22; hour++) {
        let isBlocked = false;
        blockedTimes.forEach(block => {
            if (block.day === dayOfWeek || block.day === 'Everyday') {
                const s = parseInt(block.start.split(':')[0]);
                const e = parseInt(block.end.split(':')[0]);
                if (hour >= s && hour < e) isBlocked = true;
            }
        });
        if (!isBlocked) freeSlots.push(`${hour}:00 - ${hour+1}:00`);
    }
    return freeSlots;
}

function generateDeterministicSchedule(task, blockedTimes = []) {
    const schedule = [];
    let remainingHours = task.hours;
    let currentDay = new Date();
    
    let daysIterated = 0;
    // Iterate up to deadline
    while(remainingHours > 0 && daysIterated <= task.deadline_days) {
        const dayOfWeek = currentDay.toLocaleDateString('en-US', {weekday: 'long'});
        const freeSlots = getAvailableSlots(dayOfWeek, blockedTimes);
        
        for (let slot of freeSlots) {
            if (remainingHours <= 0) break;
            schedule.push({
                time: `Day ${daysIterated + 1} (${dayOfWeek}) [${slot}]`,
                activity: `Algorithmic Study Block: ${task.name}`,
                completed: false
            });
            remainingHours--;
        }
        
        currentDay.setDate(currentDay.getDate() + 1);
        daysIterated++;
    }

    // Force fit any remaining hours if the schedule was too blocked
    if (remainingHours > 0) {
        for(let i=0; i<remainingHours; i++) {
            schedule.push({
                time: `Overtime Block ${i+1} (Post Deadline Limit)`,
                activity: `Mandatory Catchup: ${task.name}`,
                completed: false
            });
        }
    }
    
    return schedule;
}

module.exports = { generateDeterministicSchedule };
