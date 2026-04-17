// Deterministic Algorithmic Scheduling Engine

function getAvailableSlots(dayOfWeek, blockedTimes) {
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

function generateDeterministicSchedule(tasks, blockedTimes = []) {
    // 1. Sort tasks by priority
    const activeTasks = tasks.map(t => ({
        ...t.toObject(),
        remaining_hours: t.hours - (t.completed_hours || 0),
        missed_tracking: t.missed_sessions || 0
    })).filter(t => t.remaining_hours > 0).sort((a, b) => b.priority_score - a.priority_score);

    const timeline = [];
    let currentDay = new Date();
    
    // Generate up to 30 days
    for(let i=0; i<30; i++) {
        const dayOfWeek = currentDay.toLocaleDateString('en-US', {weekday: 'long'});
        const dateStr = currentDay.toLocaleDateString('en-US');
        const freeSlots = getAvailableSlots(dayOfWeek, blockedTimes);
        
        for (let slot of freeSlots) {
            // Find highest priority task that still needs hours
            let selectedTask = activeTasks.find(t => t.remaining_hours > 0);
            
            if (!selectedTask) break; // All tasks complete!
            
            let isRescheduled = selectedTask.missed_tracking > 0;
            if (isRescheduled) {
                selectedTask.missed_tracking--;
            }

            timeline.push({
                date: dateStr,
                day: dayOfWeek,
                time: slot,
                taskId: selectedTask._id,
                taskName: selectedTask.name,
                isRescheduled
            });
            
            selectedTask.remaining_hours--;
        }
        currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return timeline;
}

module.exports = { generateDeterministicSchedule };
