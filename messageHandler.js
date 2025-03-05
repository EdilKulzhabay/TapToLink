const handleMessage = async (message) => {
    const lines = message.split('\n');
    const command = lines[0]?.match(/\d+/g)?.join('')

    console.log(message);
    
    

    if (command === '1') {
        const dateInMatch = message.match(/заезд=(\d{4}-\d{2}-\d{2})/);
        const dateOutMatch = message.match(/выезд=(\d{4}-\d{2}-\d{2})/);
        const personsMatch = message.match(/количество персон=(\d+)/);
        const budgetMatch = message.match(/бюджет=(\d+)/);

        const dateIn = dateInMatch ? dateInMatch[1] : null; // "2025-03-01"
        const dateOut = dateOutMatch ? dateOutMatch[1] : null; // "2025-03-03"
        const persons = personsMatch ? parseInt(personsMatch[1], 10) : null; // 2
        const budget = budgetMatch ? parseInt(budgetMatch[1], 10) : null; // 15000

        return {what: 1, dateIn, dateOut, persons, budget}
    }
    if (command === "3") {
        if (message.includes("адрес")) {
            const str = message.replace("3\n", "");
            const address = str.replace("адрес:", "");
            return {what: 3, isAddress: true, address: address.trim()}
        } else {
            const chooseApartment = parseInt(message[2])
            return {what: 3, isAddress: false, chooseApartment}
        }
    }
};

module.exports = { handleMessage };